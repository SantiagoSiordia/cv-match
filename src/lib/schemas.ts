import { z } from "zod";

export const cvGeminiMetaSchema = z.object({
  name: z.string().nullable(),
  /** Professional headline e.g. Software Engineer, Game Developer (optional for older extractions). */
  title: z.string().nullable().optional(),
  skills: z.array(z.string()),
  experienceSummary: z.string().nullable(),
});

export type CvGeminiMeta = z.infer<typeof cvGeminiMetaSchema>;

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
  gemini: cvGeminiMetaSchema.nullable().optional(),
  geminiError: z.string().optional(),
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
  geminiSkills: z.array(z.string()).optional(),
  geminiSkillsError: z.string().optional(),
  geminiError: z.string().optional(),
  /** Normalized concat for client search (file, title, body prefix, etc.). */
  searchIndex: z.string().optional(),
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
