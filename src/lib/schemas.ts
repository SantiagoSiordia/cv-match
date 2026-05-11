import { z } from "zod";

/**
 * Raw LLM / legacy disk shapes (`title` + `skills` are older keys). Parsed output is always
 * {@link CvExtractedMeta} with empty strings / empty array when unknown.
 */
const cvExtractedMetaInputSchema = z.object({
  name: z.union([z.string(), z.null()]).optional(),
  location: z.union([z.string(), z.null()]).optional(),
  currentPosition: z.union([z.string(), z.null()]).optional(),
  /** @deprecated use currentPosition; still accepted from older extractions */
  title: z.union([z.string(), z.null()]).optional(),
  hardSkills: z.union([z.array(z.string()), z.null()]).optional(),
  /** @deprecated use hardSkills; still accepted from older extractions */
  skills: z.union([z.array(z.string()), z.null()]).optional(),
  experienceSummary: z.union([z.string(), z.null()]).optional(),
});

export const cvExtractedMetaSchema = cvExtractedMetaInputSchema.transform(
  (r) => {
    const rawList = r.hardSkills ?? r.skills;
    const list = Array.isArray(rawList)
      ? rawList.flatMap((s) =>
          typeof s === "string" && s.trim() ? [s.trim()] : [],
        )
      : [];
    const pos = r.currentPosition ?? r.title;
    return {
      name: r.name == null ? "" : String(r.name).trim(),
      location: r.location == null ? "" : String(r.location).trim(),
      currentPosition: pos == null ? "" : String(pos).trim(),
      hardSkills: list.slice(0, 40),
      experienceSummary:
        r.experienceSummary == null ? "" : String(r.experienceSummary).trim(),
    };
  },
);

/** Normalized résumé metadata: every field is always present; use "" / [] when not found. */
export type CvExtractedMeta = z.infer<typeof cvExtractedMetaSchema>;

export const compatibilityResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  skillsMatch: z.number().min(0).max(100),
  experienceRelevance: z.number().min(0).max(100),
  educationFit: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  summary: z.string(),
});

export type CompatibilityResult = z.infer<typeof compatibilityResultSchema>;

/** One row in a batched job-vs-multiple-CVs compatibility response. */
export const compatibilityBatchRowSchema = compatibilityResultSchema.extend({
  cvId: z.string().uuid(),
});

export const compatibilityBatchResponseSchema = z.object({
  evaluations: z.array(compatibilityBatchRowSchema),
});

export type CompatibilityBatchRow = z.infer<typeof compatibilityBatchRowSchema>;

/** Response shape for embedding match explanation (top roles only). */
export const topMatchJustificationsResponseSchema = z.object({
  items: z.array(
    z.object({
      jobDescriptionId: z.string(),
      justification: z.string(),
    }),
  ),
});

export type TopMatchJustificationsResponse = z.infer<
  typeof topMatchJustificationsResponseSchema
>;

export const cvStoredMetaSchema = z.object({
  id: z.string().uuid(),
  originalName: z.string(),
  uploadedAt: z.string(),
  type: z.literal("cv"),
  storageFileName: z.string(),
  extractedCharCount: z.number(),
  lowTextWarning: z.boolean().optional(),
  extracted: cvExtractedMetaSchema.nullable().optional(),
  extractedError: z.string().optional(),
  /** Normalized concat of name, title, skills, dates, filename, + résumé text slice — for search. */
  searchIndex: z.string().optional(),
});

export type CvStoredMeta = z.infer<typeof cvStoredMetaSchema>;

export const jobStoredMetaSchema = z.object({
  id: z.string().uuid(),
  originalName: z.string(),
  uploadedAt: z.string(),
  type: z.literal("job_description"),
  storageFileName: z.string(),
  mimeType: z.string(),
  extractedCharCount: z.number(),
  lowTextWarning: z.boolean().optional(),
  titleGuess: z.string().nullable().optional(),
  /** Required/preferred skills inferred once from the JD (LLM). */
  extractedSkills: z.array(z.string()).optional(),
  extractedSkillsError: z.string().optional(),
  extractedError: z.string().optional(),
  /** Normalized concat for client search (file, title, body prefix, etc.). */
  searchIndex: z.string().optional(),
  /** Provenance: pasted text, uploaded file, or one row from a CSV import. */
  sourceKind: z.enum(["file", "text", "csv_row"]).optional(),
  /** Full column map when `sourceKind` is `csv_row`. */
  structuredFields: z.record(z.string(), z.string()).optional(),
  /** Staffing export `Requirement Id` when present. */
  sourceRequirementId: z.string().optional(),
});

export type JobStoredMeta = z.infer<typeof jobStoredMetaSchema>;

/** LLM output shape for job skill extraction. */
export const jobSkillsExtractionSchema = z.object({
  skills: z.array(z.string()),
});

export type JobSkillsExtraction = z.infer<typeof jobSkillsExtractionSchema>;

export const evaluationRunSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  jobDescriptionId: z.string().uuid(),
  jobTitle: z.string().nullable().optional(),
  results: z.array(
    z.object({
      cvId: z.string().uuid(),
      cvOriginalName: z.string(),
      result: compatibilityResultSchema.nullable(),
      error: z.string().optional(),
    }),
  ),
});

export type EvaluationRun = z.infer<typeof evaluationRunSchema>;

function coerceExtractedOnCvMeta(meta: CvStoredMeta): CvStoredMeta {
  if (!meta.extracted) return meta;
  const r = cvExtractedMetaSchema.safeParse(meta.extracted);
  if (!r.success) return meta;
  return { ...meta, extracted: r.data };
}

/**
 * Parse CV meta JSON from disk: accepts current keys (`extracted`, `extractedError`)
 * or legacy disk keys (`gemini`, `geminiError`).
 */
export function parseCvStoredMetaFromDisk(raw: unknown): CvStoredMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const legacyExtractedBlob = r.gemini;
  const legacyErr = r.geminiError;
  const merged: Record<string, unknown> = { ...r };
  delete merged.gemini;
  delete merged.geminiError;
  if (merged.extracted === undefined && legacyExtractedBlob !== undefined) {
    merged.extracted = legacyExtractedBlob;
  }
  if (merged.extractedError === undefined && legacyErr !== undefined) {
    merged.extractedError = legacyErr;
  }
  const parsed = cvStoredMetaSchema.safeParse(merged);
  if (!parsed.success) return null;
  return coerceExtractedOnCvMeta(parsed.data);
}

/**
 * Parse job meta JSON from disk: accepts current keys or legacy job skill/error keys.
 */
export function parseJobStoredMetaFromDisk(raw: unknown): JobStoredMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...r };
  delete merged.geminiSkills;
  delete merged.geminiSkillsError;
  delete merged.geminiError;
  if (merged.extractedSkills === undefined && r.geminiSkills !== undefined) {
    merged.extractedSkills = r.geminiSkills;
  }
  if (
    merged.extractedSkillsError === undefined &&
    r.geminiSkillsError !== undefined
  ) {
    merged.extractedSkillsError = r.geminiSkillsError;
  }
  if (merged.extractedError === undefined && r.geminiError !== undefined) {
    merged.extractedError = r.geminiError;
  }
  const parsed = jobStoredMetaSchema.safeParse(merged);
  return parsed.success ? parsed.data : null;
}
