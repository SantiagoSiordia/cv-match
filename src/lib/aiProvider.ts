import {
  BedrockConfigError,
  evaluateCompatibilityBatchWithBedrock,
  evaluateCompatibilityWithBedrock,
  extractCvMetadataWithBedrock,
  extractJobSkillsWithBedrock,
  generateTopMatchJustifications,
  guessCvTitleWithBedrock,
  guessJobTitleWithBedrock,
} from "@/lib/bedrock";
import type {
  CompatibilityResult,
  CvExtractedMeta,
  JobSkillsExtraction,
} from "@/lib/schemas";
import type { TopMatchJustificationInput } from "@/lib/bedrock";

export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderConfigError";
  }
}

export async function extractCvMetadataWithProvider(
  cvText: string,
): Promise<CvExtractedMeta> {
  return extractCvMetadataWithBedrock(cvText);
}

export async function guessCvTitleWithProvider(
  cvText: string,
): Promise<string | null> {
  return guessCvTitleWithBedrock(cvText);
}

export async function guessJobTitleWithProvider(
  jobText: string,
): Promise<string | null> {
  return guessJobTitleWithBedrock(jobText);
}

export async function extractJobSkillsWithProvider(
  jobText: string,
): Promise<JobSkillsExtraction> {
  return extractJobSkillsWithBedrock(jobText);
}

export async function evaluateCompatibilityWithProvider(
  jobDescriptionText: string,
  cvText: string,
): Promise<CompatibilityResult> {
  return evaluateCompatibilityWithBedrock(jobDescriptionText, cvText);
}

export async function evaluateCompatibilityBatchWithProvider(
  jobDescriptionText: string,
  cvs: Array<{ cvId: string; cvText: string }>,
): Promise<Map<string, CompatibilityResult>> {
  return evaluateCompatibilityBatchWithBedrock(jobDescriptionText, cvs);
}

export async function generateTopMatchJustificationsWithProvider(
  cvText: string,
  matches: TopMatchJustificationInput[],
): Promise<Map<string, string>> {
  return generateTopMatchJustifications(cvText, matches);
}

export function isAiProviderConfigError(e: unknown): boolean {
  return (
    e instanceof AiProviderConfigError ||
    e instanceof BedrockConfigError ||
    (e instanceof Error && e.name === "AiProviderConfigError") ||
    (e instanceof Error && e.name === "BedrockConfigError")
  );
}
