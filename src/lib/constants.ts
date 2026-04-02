/** Max upload size per PRD (bytes). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Warn when extracted text is shorter than this (likely scan or empty PDF). */
export const LOW_TEXT_THRESHOLD_CHARS = 120;

/** Amazon Bedrock Claude (text / JSON) — enable model access in the Bedrock console. */
export const DEFAULT_BEDROCK_TEXT_MODEL =
  "anthropic.claude-3-5-haiku-20241022-v1:0";

/** Amazon Bedrock Titan Embeddings v2 (`InvokeModel`). */
export const DEFAULT_BEDROCK_EMBEDDING_MODEL = "amazon.titan-embed-text-v2:0";

/**
 * Google Gemini (fallback when Bedrock is unavailable). 2.5 Flash-Lite is the
 * current low-cost tier (2.0 Flash-Lite is retired for new API users).
 * Override with GEMINI_TEXT_MODEL.
 */
export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-2.5-flash-lite";

/** Gemini embedding model (`embedContent` REST API). See https://ai.google.dev/gemini-api/docs/embeddings */
export const DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

/** Max characters sent to the embedding API per document (truncate tail). */
export const MAX_EMBEDDING_CHARS = 12_000;
