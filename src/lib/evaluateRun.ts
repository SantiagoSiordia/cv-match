import {
  evaluateCompatibilityWithBedrock,
  BedrockConfigError,
} from "@/lib/bedrock";
import { saveEvaluationRun } from "@/lib/evaluationsStore";
import {
  getCvMeta,
  getJobMeta,
  readCvExtractedText,
  readJobExtractedText,
} from "@/lib/storage";
import type { CompatibilityResult } from "@/lib/schemas";

export type EvaluateInput = {
  jobDescriptionId: string;
  cvIds: string[];
};

export async function runEvaluation(input: EvaluateInput) {
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
    throw new EvaluateError(
      "NO_CVS",
      "Select at least one CV",
      400,
    );
  }

  const results: Array<{
    cvId: string;
    cvOriginalName: string;
    result: CompatibilityResult | null;
    error?: string;
  }> = [];

  for (const cvId of input.cvIds) {
    const cvMeta = await getCvMeta(cvId);
    if (!cvMeta) {
      results.push({
        cvId,
        cvOriginalName: cvId,
        result: null,
        error: "CV not found",
      });
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
      continue;
    }
    try {
      const result = await evaluateCompatibilityWithBedrock(jobText, cvText);
      results.push({
        cvId,
        cvOriginalName: cvMeta.originalName,
        result,
      });
    } catch (e) {
      if (e instanceof BedrockConfigError) {
        throw new EvaluateError("BEDROCK_CONFIG", e.message, 500);
      }
      const msg = e instanceof Error ? e.message : "Evaluation failed";
      results.push({
        cvId,
        cvOriginalName: cvMeta.originalName,
        result: null,
        error: msg,
      });
    }
  }

  const run = await saveEvaluationRun({
    jobDescriptionId: input.jobDescriptionId,
    jobTitle: job.titleGuess ?? null,
    results,
  });

  return run;
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
