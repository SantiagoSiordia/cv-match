import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  compatibilityResultSchema,
  cvGeminiMetaSchema,
  jobSkillsExtractionSchema,
  topMatchJustificationsResponseSchema,
  type CompatibilityResult,
  type CvGeminiMeta,
  type JobSkillsExtraction,
} from "@/lib/schemas";
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_TEXT_MODEL,
  MAX_EMBEDDING_CHARS,
} from "@/lib/constants";
import { stripJsonFence } from "@/lib/bedrock";
import type { TopMatchJustificationInput } from "@/lib/bedrock";

export class GeminiConfigError extends Error {
  readonly code = "MISSING_GEMINI_CONFIG" as const;
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export class GeminiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiResponseError";
  }
}

function geminiMaxRetries(): number {
  const n = Number(process.env.GEMINI_MAX_RETRIES);
  if (Number.isFinite(n) && n >= 1) return Math.min(10, Math.floor(n));
  return 5;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableGeminiError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    /503|502|504|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|try again later|overloaded|rate limit|EAI_AGAIN|fetch failed|network/i.test(
      msg,
    )
  ) {
    return true;
  }
  const status = (e as { status?: number; code?: number })?.status;
  const code = (e as { code?: number })?.code;
  if (typeof status === "number" && [429, 502, 503, 504].includes(status)) {
    return true;
  }
  if (typeof code === "number" && [429, 502, 503, 504].includes(code)) {
    return true;
  }
  return false;
}

/**
 * Parse model text: markdown fence, then full string, then first balanced `{...}`.
 */
export function parseGeminiJsonText<T>(raw: string): T {
  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };

  const fenced = stripJsonFence(raw);
  const direct = tryParse(fenced);
  if (direct !== null) return direct;

  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) {
    throw new GeminiResponseError("Model returned no JSON object");
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i]!;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new GeminiResponseError("Model returned incomplete JSON object");
  }
  const slice = trimmed.slice(start, end + 1);
  const sub = tryParse(slice);
  if (sub !== null) return sub;
  throw new GeminiResponseError(
    "Model returned invalid JSON (unparseable after extracting object)",
  );
}

async function withGeminiRetries<T>(fn: () => Promise<T>): Promise<T> {
  const max = geminiMaxRetries();
  let last: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryableGeminiError(e) || attempt === max - 1) {
        throw e;
      }
      const base = Math.min(12_000, 800 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 500);
      await sleep(base + jitter);
    }
  }
  throw last;
}

export function hasGeminiApiKey(): boolean {
  return !!(process.env.GEMINI_API_KEY?.trim());
}

function requireGeminiApiKey(): string {
  const k = process.env.GEMINI_API_KEY?.trim();
  if (!k) {
    throw new GeminiConfigError(
      "Set GEMINI_API_KEY for Google Gemini (used when Bedrock is unavailable or AI_PROVIDER=gemini).",
    );
  }
  return k;
}

export function getGeminiTextModelId(): string {
  return (
    process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_GEMINI_TEXT_MODEL
  );
}

export function getGeminiEmbeddingModelId(): string {
  return (
    process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_GEMINI_EMBEDDING_MODEL
  );
}

function getGenerativeModel() {
  const gen = new GoogleGenerativeAI(requireGeminiApiKey());
  return gen.getGenerativeModel({
    model: getGeminiTextModelId(),
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });
}

async function generateJsonText(prompt: string): Promise<string> {
  return withGeminiRetries(async () => {
    const model = getGenerativeModel();
    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim();
    if (!text) {
      throw new GeminiResponseError("Gemini returned empty text");
    }
    return text;
  });
}

function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED]`;
}

function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_EMBEDDING_CHARS) return text;
  return `${text.slice(0, MAX_EMBEDDING_CHARS)}\n\n[TRUNCATED]`;
}

function l2Normalize(values: number[]): number[] {
  let s = 0;
  for (const x of values) s += x * x;
  const n = Math.sqrt(s);
  if (n === 0) return values;
  return values.map((x) => x / n);
}

export async function extractCvMetadataWithGemini(
  cvText: string,
): Promise<CvGeminiMeta> {
  const prompt = `You extract structured data from a CV/resume text.

Return ONLY JSON with EXACTLY these keys (always present):
{"name":"","location":"","currentPosition":"","hardSkills":[],"experienceSummary":""}

Rules:
- name: full name if clearly stated, else ""
- location: current city, region, and/or country if stated (e.g. "Berlin, Germany"), else ""
- currentPosition: current job title or professional headline only (2–8 words), e.g. "Software Engineer", "SAP Consultant". Use subtitle under the name or the most recent role if clearly current; else ""
- hardSkills: technical / hard skills only — programming languages, frameworks, platforms, tools (e.g. "Java", "Python", "SAP", "AWS"). Omit soft skills. Max ~40 short tokens. Use [] if none found
- experienceSummary: 2–4 sentences on roles and seniority, else ""

CV text:
---
${truncateForPrompt(cvText, 24_000)}
---
`;

  const text = await generateJsonText(prompt);
  const parsed = parseGeminiJsonText<unknown>(text);
  return cvGeminiMetaSchema.parse(parsed);
}

export async function guessCvTitleWithGemini(
  cvText: string,
): Promise<string | null> {
  const prompt = `From this résumé/CV text, infer the candidate's current or primary professional role as a short job title or headline only (2–8 words), e.g. "Software Engineer", "Senior Game Developer". Use what appears under their name or the most recent role if that's clearly their focus. Return null only if you cannot infer.

Return ONLY JSON: {"currentPosition": string|null} (legacy {"title": string|null} is also accepted)

Résumé text:
---
${truncateForPrompt(cvText, 24_000)}
---
`;

  const text = await generateJsonText(prompt);
  const parsed = parseGeminiJsonText<{
    currentPosition?: string | null;
    title?: string | null;
  }>(text);
  const raw = parsed.currentPosition ?? parsed.title;
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  return t.length ? t : null;
}

export async function guessJobTitleWithGemini(
  jobText: string,
): Promise<string | null> {
  const prompt = `From the job description text, infer a short job title (3-8 words) or null if unclear.

Return ONLY JSON: {"title": string|null}

Job description:
---
${truncateForPrompt(jobText, 24_000)}
---
`;

  const text = await generateJsonText(prompt);
  const parsed = parseGeminiJsonText<{ title?: string | null }>(text);
  if (parsed.title === undefined || parsed.title === null) return null;
  const t = String(parsed.title).trim();
  return t.length ? t : null;
}

export async function extractJobSkillsWithGemini(
  jobText: string,
): Promise<JobSkillsExtraction> {
  const prompt = `From the job description, list technical and professional skills, tools, frameworks, and domains that are required or strongly preferred for the role.

Return ONLY JSON: {"skills": string[]}
- At most ~30 concise phrases (e.g. "Python", "AWS", "Agile", "Customer success")
- Include soft skills only if explicitly emphasized as requirements

Job description:
---
${truncateForPrompt(jobText, 24_000)}
---
`;

  const text = await generateJsonText(prompt);
  const parsed = parseGeminiJsonText<unknown>(text);
  return jobSkillsExtractionSchema.parse(parsed);
}

export async function evaluateCompatibilityWithGemini(
  jobDescriptionText: string,
  cvText: string,
): Promise<CompatibilityResult> {
  const prompt = `You are an experienced hiring manager. Score how well the candidate fits the job.

Return ONLY JSON with this exact shape:
{
  "overallScore": number (0-100),
  "skillsMatch": number (0-100),
  "experienceRelevance": number (0-100),
  "educationFit": number (0-100),
  "strengths": string[] (short bullets),
  "gaps": string[] (short bullets),
  "summary": string (2-5 sentences, plain language)
}

Scoring guidance:
- skillsMatch: overlap between required/preferred skills and CV
- experienceRelevance: role level, domain, achievements vs job duties
- educationFit: degrees/certifications vs requirements (infer reasonably if JD is vague)
- overallScore: holistic fit, not a strict average

Job description:
---
${truncateForPrompt(jobDescriptionText, 24_000)}
---

Candidate CV:
---
${truncateForPrompt(cvText, 24_000)}
---
`;

  const text = await generateJsonText(prompt);
  const parsed = parseGeminiJsonText<unknown>(text);
  return compatibilityResultSchema.parse(parsed);
}

export async function generateTopMatchJustificationsWithGemini(
  cvText: string,
  matches: TopMatchJustificationInput[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (matches.length === 0) return out;

  const cvSlice = truncateForPrompt(cvText, 18_000);
  const blocks = matches.map((m, i) => {
    const jdSlice = truncateForPrompt(m.jdText, 10_000);
    return [
      `### Rank ${i + 1}`,
      `jobDescriptionId: ${m.jobDescriptionId}`,
      `Display title: ${m.title}`,
      `Reported match score: ${m.scorePercent}% (from embedding similarity, not a human interview).`,
      `Job description:`,
      "---",
      jdSlice,
      "---",
    ].join("\n");
  });

  const prompt = `You help recruiters interpret automated "match %" scores from this app.

How the % is computed: the résumé and each job description are converted to text embeddings; cosine similarity is mapped to 0–100%. Higher % means the texts overlap more in skills, domain language, and themes in vector space — it is a statistical text similarity, not a hiring decision.

For EACH job block below, write one justification of 2–4 sentences that:
- Relates the résumé content to that job's requirements and explains why the given score is plausible (strengths and gaps).
- Does not invent employers, degrees, or skills that are not supported by the résumé text.
- If the score is low, say what seems misaligned or missing; if high, what aligns.

Return ONLY JSON with this exact shape:
{"items":[{"jobDescriptionId":"<same id as in the block>","justification":"<your text>"}]}
The items array must have exactly ${matches.length} entries in the same order as the blocks below.

Résumé:
---
${cvSlice}
---

${blocks.join("\n\n")}
`;

  const text = await generateJsonText(prompt);
  const parsed = parseGeminiJsonText<unknown>(text);
  const validated = topMatchJustificationsResponseSchema.parse(parsed);
  for (const row of validated.items) {
    const j = row.justification.trim();
    if (j.length) out.set(row.jobDescriptionId, j);
  }
  return out;
}

/** Task types supported by `gemini-embedding-001` (embedContent). */
export type GeminiEmbeddingTaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY";

/**
 * Text embeddings via Gemini API (L2-normalized for cosine similarity).
 * Pass `taskType` for asymmetric retrieval (query vs document); defaults to semantic similarity.
 */
export async function embedTextWithGemini(
  inputText: string,
  options?: { taskType?: GeminiEmbeddingTaskType },
): Promise<number[]> {
  const key = requireGeminiApiKey();
  const modelId = getGeminiEmbeddingModelId();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:embedContent?key=${encodeURIComponent(key)}`;
  const body: Record<string, unknown> = {
    model: `models/${modelId}`,
    content: { parts: [{ text: truncateForEmbedding(inputText) }] },
  };
  if (options?.taskType) {
    body.taskType = options.taskType;
  }

  return withGeminiRetries(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new GeminiResponseError(
        `Gemini embedContent failed (${res.status}): ${errText.slice(0, 500)}`,
      );
    }

    const json = (await res.json()) as {
      embedding?: { values?: number[] };
      embeddings?: Array<{ values?: number[] }>;
    };
    const values =
      json.embedding?.values ?? json.embeddings?.[0]?.values;
    if (!values?.length) {
      throw new GeminiResponseError("Gemini embedding response missing values");
    }
    return l2Normalize(values);
  });
}
