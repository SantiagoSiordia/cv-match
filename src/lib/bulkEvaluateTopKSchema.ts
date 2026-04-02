import { z } from "zod";

export const bulkEvaluateTopKBodySchema = z.object({
  k: z.number().int().min(1).max(20).default(5),
  embeddingFloorPercent: z.number().min(0).max(100).optional().default(0),
  skipIfUnchanged: z.boolean().optional().default(false),
  useBatchedCompatibility: z.boolean().optional().default(false),
});

export type BulkEvaluateTopKBody = z.infer<typeof bulkEvaluateTopKBodySchema>;

/** Parallel jobs during bulk evaluate (each job still runs up to K CV LLM calls). */
export function resolveBulkJobConcurrency(): number {
  const raw = process.env.BULK_JOB_CONCURRENCY?.trim();
  const n = raw ? parseInt(raw, 10) : 2;
  return Math.max(1, Math.min(16, Number.isFinite(n) ? n : 2));
}
