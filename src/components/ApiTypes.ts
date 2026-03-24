import type { CvStoredMeta, EvaluationRun, JobStoredMeta } from "@/lib/schemas";

export type ApiCvList = { items: CvStoredMeta[] };
export type ApiJobList = { items: JobStoredMeta[] };
export type ApiEvaluationsList = { runs: EvaluationRun[] };
export type ApiEvaluationRun = { run: EvaluationRun };

export type ApiErrorBody = {
  ok: false;
  error: { code: string; message: string };
};
