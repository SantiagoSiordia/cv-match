import { BedrockConfigError } from "@/lib/bedrock";
import { mapWithConcurrency } from "@/lib/concurrencyPool";
import { getBulkLlmGlobalSemaphore } from "@/lib/bulkLlmGlobalPool";
import {
  evaluateCompatibilityBatchWithProvider,
  evaluateCompatibilityWithProvider,
  isAiProviderConfigError,
} from "@/lib/aiProvider";
import { withLlmThrottleRetries } from "@/lib/llmThrottleRetry";
import { saveEvaluationRun } from "@/lib/evaluationsStore";
import {
  getCvMeta,
  getJobMeta,
  readCvExtractedText,
  readJobExtractedText,
} from "@/lib/storage";
import type {
  CompatibilityResult,
  CvStoredMeta,
  EvaluationRun,
} from "@/lib/schemas";

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

export type RunEvaluationOptions = {
  /**
   * When true, each compatibility LLM call uses the global bulk slot pool
   * (`BULK_LLM_GLOBAL_CONCURRENCY`). Bulk routes should set this; interactive evaluate should not.
   */
  useGlobalLlmSlot?: boolean;
  /**
   * Max parallel per-job compatibility calls. Default from `EVALUATE_CV_CONCURRENCY` (3).
   * Ignored when `useBatchedCompatibility` is true.
   */
  cvConcurrency?: number;
  /** One LLM request per job containing all CVs (smaller number of round-trips). */
  useBatchedCompatibility?: boolean;
  /** Emit JSON timing lines to stdout (`EVALUATE_LOG_TIMING=1` also enables). */
  logTimings?: boolean;
};

type PreparedRow =
  | { kind: "missing"; cvId: string; cvOriginalName: string }
  | {
      kind: "no_text";
      cvId: string;
      cvOriginalName: string;
      cvMeta: CvStoredMeta;
    }
  | {
      kind: "ok";
      cvId: string;
      cvOriginalName: string;
      cvMeta: CvStoredMeta;
      cvText: string;
    };

function resolveCvConcurrency(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit)) {
    return Math.max(1, Math.min(20, Math.floor(explicit)));
  }
  const raw = process.env.EVALUATE_CV_CONCURRENCY?.trim();
  const n = raw ? parseInt(raw, 10) : 3;
  return Math.max(1, Math.min(20, Number.isFinite(n) ? n : 3));
}

function shouldLogTimings(opt?: RunEvaluationOptions): boolean {
  if (opt?.logTimings) return true;
  return process.env.EVALUATE_LOG_TIMING?.trim() === "1";
}

function logTiming(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ source: "evaluate", ...payload }));
}

function resolveGlobalSemaphore(
  useGlobalLlmSlot: boolean | undefined,
): ReturnType<typeof getBulkLlmGlobalSemaphore> {
  if (!useGlobalLlmSlot) return null;
  return getBulkLlmGlobalSemaphore();
}

async function runOneCompatibility(
  jobText: string,
  cvText: string,
  globalSem: ReturnType<typeof getBulkLlmGlobalSemaphore>,
): Promise<CompatibilityResult> {
  const inner = () =>
    withLlmThrottleRetries(() =>
      evaluateCompatibilityWithProvider(jobText, cvText),
    );
  if (globalSem) {
    return globalSem.use(inner);
  }
  return inner();
}

async function runBatchCompatibility(
  jobText: string,
  cvs: Array<{ cvId: string; cvText: string }>,
  globalSem: ReturnType<typeof getBulkLlmGlobalSemaphore>,
): Promise<Map<string, CompatibilityResult>> {
  const inner = () =>
    withLlmThrottleRetries(() =>
      evaluateCompatibilityBatchWithProvider(jobText, cvs),
    );
  if (globalSem) {
    return globalSem.use(inner);
  }
  return inner();
}

async function evaluateJobAndCvs(
  input: EvaluateInput,
  onProgress: ProgressCb | undefined,
  options: RunEvaluationOptions | undefined,
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
  const logTimings = shouldLogTimings(options);
  const tJob0 = logTimings ? Date.now() : 0;

  if (onProgress) {
    await onProgress({ type: "start", total });
  }

  const prepared: PreparedRow[] = await Promise.all(
    input.cvIds.map(async (cvId): Promise<PreparedRow> => {
      const cvMeta = await getCvMeta(cvId);
      const nameForRow = cvMeta?.originalName ?? cvId;
      if (!cvMeta) {
        return { kind: "missing", cvId, cvOriginalName: nameForRow };
      }
      const cvText = await readCvExtractedText(cvId);
      if (!cvText?.trim()) {
        return {
          kind: "no_text",
          cvId,
          cvOriginalName: cvMeta.originalName,
          cvMeta,
        };
      }
      return {
        kind: "ok",
        cvId,
        cvOriginalName: cvMeta.originalName,
        cvMeta,
        cvText,
      };
    }),
  );

  const globalSem = resolveGlobalSemaphore(options?.useGlobalLlmSlot);
  const results: EvaluationResultRow[] = [];
  const useBatch = options?.useBatchedCompatibility === true;
  const cvConc = resolveCvConcurrency(options?.cvConcurrency);

  if (useBatch) {
    const okRows = prepared.filter((p): p is Extract<PreparedRow, { kind: "ok" }> => p.kind === "ok");
    const batchPayload = okRows.map((p) => ({
      cvId: p.cvId,
      cvText: p.cvText,
    }));

    for (let index = 0; index < prepared.length; index++) {
      const p = prepared[index]!;
      if (onProgress) {
        await onProgress({
          type: "cv_start",
          index,
          total,
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
        });
      }
    }

    let batchMap = new Map<string, CompatibilityResult>();
    if (batchPayload.length > 0) {
      const t0 = logTimings ? Date.now() : 0;
      try {
        batchMap = await runBatchCompatibility(jobText, batchPayload, globalSem);
      } catch (e) {
        if (isAiProviderConfigError(e) || e instanceof BedrockConfigError) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new EvaluateError("AI_CONFIG", msg, 500);
        }
        throw e;
      }
      if (logTimings) {
        logTiming({
          event: "evaluate_batch_llm",
          jobDescriptionId: input.jobDescriptionId,
          cvCount: batchPayload.length,
          ms: Date.now() - t0,
        });
      }
    }

    for (let index = 0; index < prepared.length; index++) {
      const p = prepared[index]!;
      if (p.kind === "missing") {
        results.push({
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          result: null,
          error: "CV not found",
        });
        if (onProgress) {
          await onProgress({
            type: "cv_done",
            index,
            total,
            cvId: p.cvId,
            cvOriginalName: p.cvOriginalName,
            error: "CV not found",
            skipped: true,
          });
        }
        continue;
      }
      if (p.kind === "no_text") {
        results.push({
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          result: null,
          error: "No extractable text for this CV",
        });
        if (onProgress) {
          await onProgress({
            type: "cv_done",
            index,
            total,
            cvId: p.cvId,
            cvOriginalName: p.cvOriginalName,
            error: "No extractable text for this CV",
            skipped: true,
          });
        }
        continue;
      }

      const result = batchMap.get(p.cvId);
      if (!result) {
        const msg = "Missing batch evaluation result for CV";
        results.push({
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          result: null,
          error: msg,
        });
        if (onProgress) {
          await onProgress({
            type: "cv_done",
            index,
            total,
            cvId: p.cvId,
            cvOriginalName: p.cvOriginalName,
            error: msg,
          });
        }
        continue;
      }

      results.push({
        cvId: p.cvId,
        cvOriginalName: p.cvOriginalName,
        result,
      });
      if (onProgress) {
        await onProgress({
          type: "cv_done",
          index,
          total,
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          overallScore: result.overallScore,
        });
      }
    }
  } else {
    const outcomeByIndex: Array<
      EvaluationResultRow | "pending"
    > = prepared.map(() => "pending");

    for (let index = 0; index < prepared.length; index++) {
      const p = prepared[index]!;
      if (onProgress) {
        await onProgress({
          type: "cv_start",
          index,
          total,
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
        });
      }

      if (p.kind === "missing") {
        const row: EvaluationResultRow = {
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          result: null,
          error: "CV not found",
        };
        outcomeByIndex[index] = row;
        if (onProgress) {
          await onProgress({
            type: "cv_done",
            index,
            total,
            cvId: p.cvId,
            cvOriginalName: p.cvOriginalName,
            error: "CV not found",
            skipped: true,
          });
        }
        continue;
      }
      if (p.kind === "no_text") {
        const row: EvaluationResultRow = {
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          result: null,
          error: "No extractable text for this CV",
        };
        outcomeByIndex[index] = row;
        if (onProgress) {
          await onProgress({
            type: "cv_done",
            index,
            total,
            cvId: p.cvId,
            cvOriginalName: p.cvOriginalName,
            error: "No extractable text for this CV",
            skipped: true,
          });
        }
        continue;
      }
    }

    const okSlots = prepared
      .map((p, index) => ({ p, index }))
      .filter(
        (x): x is { p: Extract<PreparedRow, { kind: "ok" }>; index: number } =>
          x.p.kind === "ok",
      );

    await mapWithConcurrency(okSlots, cvConc, async ({ p, index }) => {
      const t0 = logTimings ? Date.now() : 0;
      try {
        const result = await runOneCompatibility(
          jobText,
          p.cvText,
          globalSem,
        );
        if (logTimings) {
          logTiming({
            event: "evaluate_cv_llm",
            jobDescriptionId: input.jobDescriptionId,
            cvId: p.cvId,
            ms: Date.now() - t0,
          });
        }
        outcomeByIndex[index] = {
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          result,
        };
        if (onProgress) {
          await onProgress({
            type: "cv_done",
            index,
            total,
            cvId: p.cvId,
            cvOriginalName: p.cvOriginalName,
            overallScore: result.overallScore,
          });
        }
      } catch (e) {
        if (isAiProviderConfigError(e) || e instanceof BedrockConfigError) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new EvaluateError("AI_CONFIG", msg, 500);
        }
        const msg = e instanceof Error ? e.message : "Evaluation failed";
        outcomeByIndex[index] = {
          cvId: p.cvId,
          cvOriginalName: p.cvOriginalName,
          result: null,
          error: msg,
        };
        if (onProgress) {
          await onProgress({
            type: "cv_done",
            index,
            total,
            cvId: p.cvId,
            cvOriginalName: p.cvOriginalName,
            error: msg,
          });
        }
      }
    });

    for (let i = 0; i < prepared.length; i++) {
      const o = outcomeByIndex[i];
      if (o === "pending") {
        throw new Error("evaluateJobAndCvs: internal state pending");
      }
      results.push(o);
    }
  }

  if (logTimings) {
    logTiming({
      event: "evaluate_job_done",
      jobDescriptionId: input.jobDescriptionId,
      cvCount: total,
      batched: useBatch,
      ms: Date.now() - tJob0,
    });
  }

  return {
    jobDescriptionId: input.jobDescriptionId,
    jobTitle: job.titleGuess ?? null,
    results,
  };
}

export async function runEvaluation(
  input: EvaluateInput,
  options?: RunEvaluationOptions,
) {
  const { jobDescriptionId, jobTitle, results } = await evaluateJobAndCvs(
    input,
    undefined,
    options,
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
  options?: RunEvaluationOptions,
): Promise<void> {
  const { jobDescriptionId, jobTitle, results } = await evaluateJobAndCvs(
    input,
    emit,
    options,
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
