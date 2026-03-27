import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  compatibilityResultSchema,
  cvGeminiMetaSchema,
  topMatchJustificationsResponseSchema,
  type CompatibilityResult,
  type CvGeminiMeta,
} from "@/lib/schemas";
import {
  DEFAULT_BEDROCK_TEXT_MODEL,
} from "@/lib/constants";

export class BedrockConfigError extends Error {
  readonly code = "MISSING_BEDROCK_CONFIG" as const;
  constructor(message: string) {
    super(message);
    this.name = "BedrockConfigError";
  }
}

export class BedrockResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BedrockResponseError";
  }
}

let cachedClient: BedrockRuntimeClient | null = null;
let cachedRegion: string | null = null;

function resolveRegion(): string {
  return (
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    ""
  );
}

export function getBedrockRuntimeClient(): BedrockRuntimeClient {
  const region = resolveRegion();
  if (!region) {
    throw new BedrockConfigError(
      "Set AWS_REGION or AWS_DEFAULT_REGION for Amazon Bedrock.",
    );
  }
  if (!cachedClient || cachedRegion !== region) {
    cachedClient = new BedrockRuntimeClient({ region });
    cachedRegion = region;
  }
  return cachedClient;
}

export function getTextModelId(): string {
  return (
    process.env.BEDROCK_TEXT_MODEL_ID?.trim() || DEFAULT_BEDROCK_TEXT_MODEL
  );
}

async function invokeClaudeJson(prompt: string): Promise<string> {
  const client = getBedrockRuntimeClient();
  const modelId = getTextModelId();
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 8192,
    temperature: 0.25,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }],
      },
    ],
  });

  let responseBody: Uint8Array;
  try {
    const out = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: new TextEncoder().encode(body),
      }),
    );
    responseBody = out.body as Uint8Array;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new BedrockResponseError(`Bedrock invocation failed: ${msg}`);
  }

  const raw = new TextDecoder().decode(responseBody);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new BedrockResponseError("Bedrock returned non-JSON body");
  }

  const content = (
    parsed as {
      content?: Array<{ type?: string; text?: string }>;
    }
  ).content;
  const textBlock = content?.find((c) => c.type === "text");
  const text = textBlock?.text?.trim();
  if (!text) {
    throw new BedrockResponseError("Model returned no text content");
  }
  return text;
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (fence?.[1]) return fence[1].trim();
  return trimmed;
}

export function parseJsonObject<T>(raw: string): T {
  const inner = stripJsonFence(raw);
  try {
    return JSON.parse(inner) as T;
  } catch {
    throw new BedrockResponseError("Model returned invalid JSON");
  }
}

export async function extractCvMetadataWithBedrock(
  cvText: string,
): Promise<CvGeminiMeta> {
  const prompt = `You extract structured data from a CV/resume text.

Return ONLY JSON matching this shape:
{"name": string|null, "title": string|null, "skills": string[], "experienceSummary": string|null}

Rules:
- name: candidate full name if clearly stated, else null
- title: current or primary professional role as written on the CV — a short job title or headline only (e.g. "Software Engineer", "Senior Game Developer", "Full Stack Developer"), typically 2–6 words. Infer from job headings or subtitle under the name if present; else null if unclear
- skills: concise skill phrases (max ~25 items)
- experienceSummary: 2-4 sentences on roles and seniority, else null

CV text:
---
${truncateForPrompt(cvText, 24_000)}
---
`;

  const text = await invokeClaudeJson(prompt);
  const parsed = parseJsonObject<unknown>(text);
  return cvGeminiMetaSchema.parse(parsed);
}

/** Short professional title from résumé text only (for backfill when `title` was missing). */
export async function guessCvTitleWithBedrock(
  cvText: string,
): Promise<string | null> {
  const prompt = `From this résumé/CV text, infer the candidate's current or primary professional role as a short job title or headline only (2–8 words), e.g. "Software Engineer", "Senior Game Developer". Use what appears under their name or the most recent role if that's clearly their focus. Return null only if you cannot infer.

Return ONLY JSON: {"title": string|null}

Résumé text:
---
${truncateForPrompt(cvText, 24_000)}
---
`;

  const text = await invokeClaudeJson(prompt);
  const parsed = parseJsonObject<{ title?: string | null }>(text);
  if (parsed.title === undefined || parsed.title === null) return null;
  const t = String(parsed.title).trim();
  return t.length ? t : null;
}

export async function guessJobTitleWithBedrock(
  jobText: string,
): Promise<string | null> {
  const prompt = `From the job description text, infer a short job title (3-8 words) or null if unclear.

Return ONLY JSON: {"title": string|null}

Job description:
---
${truncateForPrompt(jobText, 24_000)}
---
`;

  const text = await invokeClaudeJson(prompt);
  const parsed = parseJsonObject<{ title?: string | null }>(text);
  if (parsed.title === undefined || parsed.title === null) return null;
  const t = String(parsed.title).trim();
  return t.length ? t : null;
}

export async function evaluateCompatibilityWithBedrock(
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

  const text = await invokeClaudeJson(prompt);
  const parsed = parseJsonObject<unknown>(text);
  return compatibilityResultSchema.parse(parsed);
}

export type TopMatchJustificationInput = {
  jobDescriptionId: string;
  title: string;
  jdText: string;
  scorePercent: number;
};

/**
 * Short prose explaining why each embedding match % is plausible, for the top
 * ranked jobs only. Uses the same CV + JD text the user sees in the product.
 */
export async function generateTopMatchJustifications(
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

  const text = await invokeClaudeJson(prompt);
  const parsed = parseJsonObject<unknown>(text);
  const validated = topMatchJustificationsResponseSchema.parse(parsed);
  for (const row of validated.items) {
    const j = row.justification.trim();
    if (j.length) out.set(row.jobDescriptionId, j);
  }
  return out;
}

function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED]`;
}
