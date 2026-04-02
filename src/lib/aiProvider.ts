import {
  BedrockConfigError,
  BedrockResponseError,
  evaluateCompatibilityBatchWithBedrock,
  evaluateCompatibilityWithBedrock,
  extractCvMetadataWithBedrock,
  extractJobSkillsWithBedrock,
  generateTopMatchJustifications,
  guessCvTitleWithBedrock,
  guessJobTitleWithBedrock,
} from "@/lib/bedrock";
import {
  evaluateCompatibilityBatchWithGemini,
  evaluateCompatibilityWithGemini,
  extractCvMetadataWithGemini,
  extractJobSkillsWithGemini,
  GeminiConfigError,
  generateTopMatchJustificationsWithGemini,
  guessCvTitleWithGemini,
  guessJobTitleWithGemini,
  hasGeminiApiKey,
} from "@/lib/gemini";
import type {
  CompatibilityResult,
  CvGeminiMeta,
  JobSkillsExtraction,
} from "@/lib/schemas";
import type { TopMatchJustificationInput } from "@/lib/bedrock";

export { GeminiConfigError };
export type AiProviderMode = "auto" | "bedrock" | "gemini";

export class AiProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderConfigError";
  }
}

export function getAiProviderMode(): AiProviderMode {
  const m = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (m === "bedrock" || m === "gemini") return m;
  return "auto";
}

function resolveAwsRegion(): string {
  return (
    process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || ""
  );
}

/** True when Bedrock is likely unreachable (missing region or typical credential errors). */
export function isBedrockFailureEligibleForFallback(err: unknown): boolean {
  if (err instanceof BedrockConfigError) return true;
  const msg =
    err instanceof BedrockResponseError || err instanceof Error
      ? err.message
      : String(err);
  return /credentials|Credential|AccessDenied|Unauthorized|InvalidClientTokenId|ExpiredToken|security token|Could not load credentials|EC2MetadataError|not authorized|Access Denied/i.test(
    msg,
  );
}

async function withBedrockPreferred<T>(
  bedrockFn: () => Promise<T>,
  geminiFn: () => Promise<T>,
): Promise<T> {
  const mode = getAiProviderMode();
  if (mode === "gemini") {
    return geminiFn();
  }
  if (mode === "bedrock") {
    return bedrockFn();
  }
  const region = resolveAwsRegion();
  if (!region) {
    if (!hasGeminiApiKey()) {
      throw new AiProviderConfigError(
        "Set AWS_REGION (Amazon Bedrock) or GEMINI_API_KEY (Google Gemini) for AI features.",
      );
    }
    return geminiFn();
  }
  try {
    return await bedrockFn();
  } catch (e) {
    if (!isBedrockFailureEligibleForFallback(e) || !hasGeminiApiKey()) {
      throw e;
    }
    try {
      return await geminiFn();
    } catch (ge) {
      const g = ge instanceof Error ? ge.message : String(ge);
      const b = e instanceof Error ? e.message : String(e);
      throw new AiProviderConfigError(
        `Bedrock failed (${b}); Gemini fallback failed (${g}).`,
      );
    }
  }
}

export async function extractCvMetadataWithProvider(
  cvText: string,
): Promise<CvGeminiMeta> {
  return withBedrockPreferred(
    () => extractCvMetadataWithBedrock(cvText),
    () => extractCvMetadataWithGemini(cvText),
  );
}

export async function guessCvTitleWithProvider(
  cvText: string,
): Promise<string | null> {
  return withBedrockPreferred(
    () => guessCvTitleWithBedrock(cvText),
    () => guessCvTitleWithGemini(cvText),
  );
}

export async function guessJobTitleWithProvider(
  jobText: string,
): Promise<string | null> {
  return withBedrockPreferred(
    () => guessJobTitleWithBedrock(jobText),
    () => guessJobTitleWithGemini(jobText),
  );
}

export async function extractJobSkillsWithProvider(
  jobText: string,
): Promise<JobSkillsExtraction> {
  return withBedrockPreferred(
    () => extractJobSkillsWithBedrock(jobText),
    () => extractJobSkillsWithGemini(jobText),
  );
}

export async function evaluateCompatibilityWithProvider(
  jobDescriptionText: string,
  cvText: string,
): Promise<CompatibilityResult> {
  return withBedrockPreferred(
    () => evaluateCompatibilityWithBedrock(jobDescriptionText, cvText),
    () => evaluateCompatibilityWithGemini(jobDescriptionText, cvText),
  );
}

export async function evaluateCompatibilityBatchWithProvider(
  jobDescriptionText: string,
  cvs: Array<{ cvId: string; cvText: string }>,
): Promise<Map<string, CompatibilityResult>> {
  return withBedrockPreferred(
    () => evaluateCompatibilityBatchWithBedrock(jobDescriptionText, cvs),
    () => evaluateCompatibilityBatchWithGemini(jobDescriptionText, cvs),
  );
}

export async function generateTopMatchJustificationsWithProvider(
  cvText: string,
  matches: TopMatchJustificationInput[],
): Promise<Map<string, string>> {
  return withBedrockPreferred(
    () => generateTopMatchJustifications(cvText, matches),
    () => generateTopMatchJustificationsWithGemini(cvText, matches),
  );
}

export function isAiProviderConfigError(e: unknown): boolean {
  return (
    e instanceof AiProviderConfigError ||
    e instanceof GeminiConfigError ||
    (e instanceof Error && e.name === "GeminiConfigError")
  );
}
