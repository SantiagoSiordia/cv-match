import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  compatibilityResultSchema,
  cvGeminiMetaSchema,
  topMatchJustificationsResponseSchema,
  type CompatibilityResult,
  type CvGeminiMeta,
} from "@/lib/schemas";
import { DEFAULT_GEMINI_MODEL } from "@/lib/constants";

export class GeminiConfigError extends Error {
  readonly code = "MISSING_API_KEY" as const;
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "GeminiConfigError";
  }
}

export class GeminiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiResponseError";
  }
}

function getGenerativeModel() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new GeminiConfigError();
  }
  const genAI = new GoogleGenerativeAI(key);
  const model =
    process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return genAI.getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.25,
    },
  });
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
    throw new GeminiResponseError("Model returned invalid JSON");
  }
}

export async function extractCvMetadataWithGemini(
  cvText: string,
): Promise<CvGeminiMeta> {
  const model = getGenerativeModel();
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

  const res = await model.generateContent(prompt);
  const text = res.response.text();
  const parsed = parseJsonObject<unknown>(text);
  return cvGeminiMetaSchema.parse(parsed);
}

/** Short professional title from résumé text only (for backfill when `title` was missing). */
export async function guessCvTitleWithGemini(
  cvText: string,
): Promise<string | null> {
  const model = getGenerativeModel();
  const prompt = `From this résumé/CV text, infer the candidate's current or primary professional role as a short job title or headline only (2–8 words), e.g. "Software Engineer", "Senior Game Developer". Use what appears under their name or the most recent role if that's clearly their focus. Return null only if you cannot infer.

Return ONLY JSON: {"title": string|null}

Résumé text:
---
${truncateForPrompt(cvText, 24_000)}
---
`;

  const res = await model.generateContent(prompt);
  const text = res.response.text();
  const parsed = parseJsonObject<{ title?: string | null }>(text);
  if (parsed.title === undefined || parsed.title === null) return null;
  const t = String(parsed.title).trim();
  return t.length ? t : null;
}

export async function guessJobTitleWithGemini(
  jobText: string,
): Promise<string | null> {
  const model = getGenerativeModel();
  const prompt = `From the job description text, infer a short job title (3-8 words) or null if unclear.

Return ONLY JSON: {"title": string|null}

Job description:
---
${truncateForPrompt(jobText, 24_000)}
---
`;

  const res = await model.generateContent(prompt);
  const text = res.response.text();
  const parsed = parseJsonObject<{ title?: string | null }>(text);
  if (parsed.title === undefined || parsed.title === null) return null;
  const t = String(parsed.title).trim();
  return t.length ? t : null;
}

export async function evaluateCompatibilityWithGemini(
  jobDescriptionText: string,
  cvText: string,
): Promise<CompatibilityResult> {
  const model = getGenerativeModel();
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

  const res = await model.generateContent(prompt);
  const text = res.response.text();
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

  const model = getGenerativeModel();
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

  const res = await model.generateContent(prompt);
  const text = res.response.text();
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
