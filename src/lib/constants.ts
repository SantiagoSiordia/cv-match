/** Max upload size per PRD (bytes). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Warn when extracted text is shorter than this (likely scan or empty PDF). */
export const LOW_TEXT_THRESHOLD_CHARS = 120;

/** Stable generateContent model (2.0 Flash is deprecated for new API keys). */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Gemini text embedding model (REST `embedContent` / `batchEmbedContents`). */
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

/** Max characters sent to the embedding API per document (truncate tail). */
export const MAX_EMBEDDING_CHARS = 12_000;
