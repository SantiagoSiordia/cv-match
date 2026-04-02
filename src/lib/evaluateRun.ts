import { BedrockConfigError } from "@/lib/bedrock";
import {
  evaluateCompatibilityWithProvider,
  isAiProviderConfigError,
} from "@/lib/aiProvider";
import { saveEvaluationRun } from "@/lib/evaluationsStore";
import {
  getCvMeta,
  getJobMeta,
  readCvExtractedText,
  readJobExtractedText,
} from "@/lib/storage";
import type { CompatibilityResult, EvaluationRun } from "@/lib/schemas";

export type EvaluateInput = {
  jobDescriptionId: string;
  cvIds: string[];
};

export type EvaluationResultRow = {
  cvId: string;
  cvOriginalName: string;
  result: CompatibilityResult | null;
  error?: string;
};

export type EvaluateStreamEvent =
  | { type: "start"; total: number }
  | {
      type: "cv_start";
      index: number;
      total: number;
      cvId: string;
      cvOriginalName: string;
    }
  | {
      type: "cv_done";
      index: number;
      total: number;
      cvId: string;
      cvOriginalName: string;
      overallScore?: number;
      error?: string;
      skipped?: boolean;
    }
  | { type: "complete"; run: EvaluationRun }
  | { type: "fatal"; code: string; message: string; status: number };

type ProgressCb = (event: EvaluateStreamEvent) => void | Promise<void>;

async function evaluateJobAndCvs(
  input: EvaluateInput,
  onProgress?: ProgressCb,
): Promise<{
  jobDescriptionId: string;
  jobTitle: string | null;
  results: EvaluationResultRow[];
}> {
  const job = await getJobMeta(input.jobDescriptionId);
  if (!job) {
    throw new EvaluateError("JOB_NOT_FOUND", "Job description not found", 404);
  }
  const jobText = await readJobExtractedText(input.jobDescriptionId);
  if (!jobText?.trim()) {
    throw new EvaluateError(
      "JOB_TEXT_MISSING",
      "No extractable text for this job description",
      400,
    );
  }

  if (!input.cvIds.length) {
    throw new EvaluateError("NO_CVS", "Select at least one CV", 400);
  }

  const total = input.cvIds.length;
  if (onProgress) {
    await onProgress({ type: "start", total });
  }

  const results: EvaluationResultRow[] = [];

  for (let index = 0; index < input.cvIds.length; index++) {
    const cvId = input.cvIds[index]!;
    const cvMeta = await getCvMeta(cvId);
    const nameForRow = cvMeta?.originalName ?? cvId;

    if (onProgress) {
      await onProgress({
        type: "cv_start",
        index,
        total,
        cvId,
        cvOriginalName: nameForRow,
      });
    }

    if (!cvMeta) {
      results.push({
        cvId,
        cvOriginalName: cvId,
        result: null,
        error: "CV not found",
      });
      if (onProgress) {
        await onProgress({
          type: "cv_done",
          index,
          total,
          cvId,
          cvOriginalName: cvId,
          error: "CV not found",
          skipped: true,
        });
      }
      continue;
    }

    const cvText = await readCvExtractedText(cvId);
    if (!cvText?.trim()) {
      results.push({
        cvId,
        cvOriginalName: cvMeta.originalName,
        result: null,
        error: "No extractable text for this CV",
      });
      if (onProgress) {
        await onProgress({
          type: "cv_done",
          index,
          total,
          cvId,
          cvOriginalName: cvMeta.originalName,
          error: "No extractable text for this CV",
          skipped: true,
        });
      }
      continue;
    }

    try {
      const result = await evaluateCompatibilityWithProvider(jobText, cvText);
      results.push({
        cvId,
        cvOriginalName: cvMeta.originalName,
        result,
      });
      if (onProgress) {
        await onProgress({
          type: "cv_done",
          index,
          total,
          cvId,
          cvOriginalName: cvMeta.originalName,
          overallScore: result.overallScore,
        });
      }
    } catch (e) {
      if (isAiProviderConfigError(e) || e instanceof BedrockConfigError) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new EvaluateError("AI_CONFIG", msg, 500);
      }
      const msg = e instanceof Error ? e.message : "Evaluation failed";
      results.push({
        cvId,
        cvOriginalName: cvMeta.originalName,
        result: null,
        error: msg,
      });
      if (onProgress) {
        await onProgress({
          type: "cv_done",
          index,
          total,
          cvId,
          cvOriginalName: cvMeta.originalName,
          error: msg,
        });
      }
    }
  }

  return {
    jobDescriptionId: input.jobDescriptionId,
    jobTitle: job.titleGuess ?? null,
    results,
  };
}

export async function runEvaluation(input: EvaluateInput) {
  const { jobDescriptionId, jobTitle, results } = await evaluateJobAndCvs(
    input,
    undefined,
  );
  return saveEvaluationRun({
    jobDescriptionId,
    jobTitle,
    results,
  });
}

/**
 * Runs evaluation and emits NDJSON-friendly events (for streaming HTTP).
 */
export async function runEvaluationStreaming(
  input: EvaluateInput,
  emit: ProgressCb,
): Promise<void> {
  const { jobDescriptionId, jobTitle, results } = await evaluateJobAndCvs(
    input,
    emit,
  );
  const run = await saveEvaluationRun({
    jobDescriptionId,
    jobTitle,
    results,
  });
  await emit({ type: "complete", run });
}

export class EvaluateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EvaluateError";
  }
}
