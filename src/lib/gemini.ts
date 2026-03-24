import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  compatibilityResultSchema,
  cvGeminiMetaSchema,
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
{"name": string|null, "skills": string[], "experienceSummary": string|null}

Rules:
- name: candidate full name if clearly stated, else null
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

function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED]`;
}
