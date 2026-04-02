import type { CvStoredMeta, EvaluationRun, JobStoredMeta } from "@/lib/schemas";

/** NDJSON lines from `POST /api/evaluate/stream`. */
export type { EvaluateStreamEvent } from "@/lib/evaluateRun";

/** NDJSON lines from `POST /api/analytics/bulk-evaluate-top-k/stream`. */
export type { BulkEvaluateStreamEvent } from "@/lib/bulkEvaluateStreamEvents";

export type ApiCvList = { items: CvStoredMeta[] };
export type ApiJobList = { items: JobStoredMeta[] };

/** Per-file failure from bulk PDF upload (`POST` with multiple `files`). */
export type ApiBulkFileError = {
  fileName: string;
  code: string;
  message: string;
};
export type ApiEvaluationsList = { runs: EvaluationRun[] };
export type ApiEvaluationRun = { run: EvaluationRun };

export type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string };
};
