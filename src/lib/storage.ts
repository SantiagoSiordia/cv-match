import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES, LOW_TEXT_THRESHOLD_CHARS } from "@/lib/constants";
import {
  cvsExtractedDir,
  cvsMetaDir,
  cvsPdfDir,
  evaluationsDir,
  jobDescriptionsDir,
} from "@/lib/paths";
import { extractTextFromPdf, extractTextFromPlainBuffer } from "@/lib/extractText";
import {
  extractCvMetadataWithGemini,
  guessCvTitleWithGemini,
  guessJobTitleWithGemini,
  GeminiConfigError,
} from "@/lib/gemini";
import { buildCvSearchIndex } from "@/lib/cvSearchIndex";
import type { CvStoredMeta, JobStoredMeta } from "@/lib/schemas";

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "FILE_TOO_LARGE"
      | "INVALID_TYPE"
      | "NOT_FOUND"
      | "READ_FAILED",
  ) {
    super(message);
    this.name = "StorageError";
  }
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function jdMetaPath(id: string) {
  return path.join(jobDescriptionsDir(), `${id}.meta.json`);
}

function jdExtractedPath(id: string) {
  return path.join(jobDescriptionsDir(), `${id}.extracted.txt`);
}

function cvMetaFile(id: string) {
  return path.join(cvsMetaDir(), `${id}.meta.json`);
}

function cvExtractedFile(id: string) {
  return path.join(cvsExtractedDir(), `${id}.extracted.txt`);
}

export async function initStorageDirs() {
  await ensureDir(cvsPdfDir());
  await ensureDir(cvsExtractedDir());
  await ensureDir(cvsMetaDir());
  await ensureDir(jobDescriptionsDir());
  await ensureDir(evaluationsDir());
}

function assertSize(size: number) {
  if (size > MAX_UPLOAD_BYTES) {
    throw new StorageError("File exceeds 10 MB limit", "FILE_TOO_LARGE");
  }
}

/**
 * Persist a CV PDF with extracted text and optional Gemini metadata.
 * Use `skipGemini: true` for bulk imports to avoid API cost/latency.
 */
export async function persistCvPdf(
  buffer: Buffer,
  originalName: string,
  options: { skipGemini?: boolean } = {},
): Promise<CvStoredMeta> {
  await initStorageDirs();
  assertSize(buffer.length);

  const id = randomUUID();
  const storageFileName = `${id}.pdf`;
  await writeFile(path.join(cvsPdfDir(), storageFileName), buffer);

  let extracted = "";
  let extractError: string | undefined;
  try {
    extracted = await extractTextFromPdf(buffer);
  } catch {
    extractError = "Could not extract text from PDF";
  }
  await writeFile(cvExtractedFile(id), extracted, "utf8");

  const lowTextWarning =
    extracted.length > 0 && extracted.length < LOW_TEXT_THRESHOLD_CHARS;

  const skipGemini = options.skipGemini === true;
  let gemini: CvStoredMeta["gemini"] = null;
  let geminiError: string | undefined;

  if (!skipGemini) {
    if (extracted.length > 0) {
      try {
        gemini = await extractCvMetadataWithGemini(extracted);
      } catch (e) {
        gemini = null;
        if (e instanceof GeminiConfigError) {
          geminiError = e.message;
        } else if (e instanceof Error) {
          geminiError = e.message;
        } else {
          geminiError = "Metadata extraction failed";
        }
      }
    } else {
      geminiError = extractError ?? "No text extracted from PDF";
    }
  }

  const uploadedAt = new Date().toISOString();
  const meta: CvStoredMeta = {
    id,
    originalName: originalName || "cv.pdf",
    uploadedAt,
    type: "cv",
    storageFileName,
    extractedCharCount: extracted.length,
    ...(lowTextWarning ? { lowTextWarning: true } : {}),
    gemini,
    ...(geminiError ? { geminiError } : {}),
    searchIndex: buildCvSearchIndex(
      originalName || "cv.pdf",
      uploadedAt,
      gemini,
      extracted,
    ),
  };

  await writeFile(cvMetaFile(id), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export async function saveCvFromFile(file: File): Promise<CvStoredMeta> {
  assertSize(file.size);
  const mime = (file.type || "").toLowerCase();
  if (mime !== "application/pdf") {
    throw new StorageError("CV must be a PDF", "INVALID_TYPE");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return persistCvPdf(buffer, file.name || "cv.pdf", { skipGemini: false });
}

export async function listCvs(): Promise<CvStoredMeta[]> {
  await initStorageDirs();
  const names = await readdir(cvsMetaDir());
  const metas: CvStoredMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    const full = path.join(cvsMetaDir(), name);
    try {
      const raw = await readFile(full, "utf8");
      const parsed = JSON.parse(raw) as CvStoredMeta;
      if (parsed.type === "cv") metas.push(parsed);
    } catch {
      /* skip broken meta */
    }
  }
  metas.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );
  return metas;
}

export async function getCvMeta(id: string): Promise<CvStoredMeta | null> {
  await initStorageDirs();
  try {
    const raw = await readFile(cvMetaFile(id), "utf8");
    const parsed = JSON.parse(raw) as CvStoredMeta;
    return parsed.type === "cv" ? parsed : null;
  } catch {
    return null;
  }
}

export async function readCvExtractedText(id: string): Promise<string | null> {
  const meta = await getCvMeta(id);
  if (!meta) return null;
  try {
    return await readFile(cvExtractedFile(id), "utf8");
  } catch {
    return null;
  }
}

/** True when we should run full Gemini extraction (missing or thin metadata). */
function cvNeedsGeminiBackfill(meta: CvStoredMeta): boolean {
  if (!meta.gemini) return true;
  const g = meta.gemini;
  const hasIdentity = !!(g.name?.trim() || g.title?.trim());
  if (!hasIdentity) return true;
  if (g.skills.length === 0) return true;
  if (!g.experienceSummary?.trim()) return true;
  return false;
}

/**
 * Before job matching: backfill Gemini metadata (name, title, skills, summary) when
 * incomplete, then infer title if still missing. Updates `searchIndex`. Re-throws
 * `GeminiConfigError` (no API key). On extraction failure with no prior gemini, sets
 * `geminiError` and still returns meta for the match to proceed.
 */
export async function prepareCvForMatch(cvId: string): Promise<CvStoredMeta | null> {
  const meta = await getCvMeta(cvId);
  if (!meta) return null;

  const text = (await readCvExtractedText(cvId)) ?? "";
  if (!text.trim()) return meta;

  let gemini = meta.gemini ?? null;
  let geminiError: string | undefined = meta.geminiError;
  let changed = false;

  if (cvNeedsGeminiBackfill(meta)) {
    try {
      gemini = await extractCvMetadataWithGemini(text);
      geminiError = undefined;
      changed = true;
    } catch (e) {
      if (e instanceof GeminiConfigError) {
        throw e;
      }
      if (!meta.gemini) {
        geminiError =
          e instanceof Error ? e.message : "Metadata extraction failed";
        gemini = null;
        changed = true;
      } else {
        gemini = meta.gemini;
      }
    }
  }

  if (gemini && !gemini.title?.trim()) {
    try {
      const title = await guessCvTitleWithGemini(text);
      if (title?.trim()) {
        gemini = { ...gemini, title: title.trim() };
        changed = true;
      }
    } catch {
      /* ignore title inference errors */
    }
  }

  if (!changed) return meta;

  const next: CvStoredMeta = {
    ...meta,
    gemini,
    searchIndex: buildCvSearchIndex(
      meta.originalName,
      meta.uploadedAt,
      gemini,
      text,
    ),
  };
  if (geminiError !== undefined) {
    next.geminiError = geminiError;
  } else {
    delete (next as { geminiError?: string }).geminiError;
  }

  await writeFile(cvMetaFile(cvId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function readCvPdfPath(id: string): Promise<string | null> {
  const meta = await getCvMeta(id);
  if (!meta) return null;
  return path.join(cvsPdfDir(), meta.storageFileName);
}

export async function deleteCv(id: string): Promise<boolean> {
  const meta = await getCvMeta(id);
  if (!meta) return false;
  const files = [
    path.join(cvsPdfDir(), meta.storageFileName),
    cvMetaFile(id),
    cvExtractedFile(id),
  ];
  for (const f of files) {
    try {
      await unlink(f);
    } catch {
      /* ignore */
    }
  }
  return true;
}

function isPdfMime(mime: string, name: string) {
  const m = mime.toLowerCase();
  if (m === "application/pdf") return true;
  return name.toLowerCase().endsWith(".pdf");
}

function isTextMime(mime: string, name: string) {
  const m = mime.toLowerCase();
  if (m === "text/plain" || m === "application/octet-stream") return true;
  return name.toLowerCase().endsWith(".txt");
}

export type PersistJobDescriptionOptions = {
  /** When true, do not call Gemini for title; use `explicitTitleGuess` or null. */
  skipTitleInference?: boolean;
  /** Used when `skipTitleInference` is true (e.g. bulk seed title). */
  explicitTitleGuess?: string | null;
};

/**
 * Core write path for job descriptions (PDF or plain text buffer).
 */
export async function persistJobDescriptionFromBuffer(
  buffer: Buffer,
  originalName: string,
  effectiveMime: "application/pdf" | "text/plain",
  options: PersistJobDescriptionOptions = {},
): Promise<JobStoredMeta> {
  await initStorageDirs();
  assertSize(buffer.length);

  const id = randomUUID();
  const storageFileName =
    effectiveMime === "application/pdf" ? `${id}.pdf` : `${id}.txt`;

  await writeFile(path.join(jobDescriptionsDir(), storageFileName), buffer);

  let extracted = "";
  let extractError: string | undefined;
  try {
    if (effectiveMime === "application/pdf") {
      extracted = await extractTextFromPdf(buffer);
    } else {
      extracted = extractTextFromPlainBuffer(buffer);
    }
  } catch {
    extractError = "Could not extract text";
  }
  await writeFile(jdExtractedPath(id), extracted, "utf8");

  const lowTextWarning =
    extracted.length > 0 && extracted.length < LOW_TEXT_THRESHOLD_CHARS;

  const skipTitle = options.skipTitleInference === true;
  let titleGuess: string | null | undefined;
  let geminiError: string | undefined;

  if (skipTitle) {
    const t = options.explicitTitleGuess?.trim();
    titleGuess = t?.length ? t : null;
    if (extracted.length === 0) {
      geminiError = extractError ?? "No text extracted";
    }
  } else if (extracted.length > 0) {
    try {
      titleGuess = await guessJobTitleWithGemini(extracted);
    } catch (e) {
      if (e instanceof GeminiConfigError) {
        geminiError = e.message;
      } else if (e instanceof Error) {
        geminiError = e.message;
      } else {
        geminiError = "Title inference failed";
      }
    }
  } else {
    geminiError = extractError ?? "No text extracted";
  }

  const meta: JobStoredMeta = {
    id,
    originalName: originalName || "job-description",
    uploadedAt: new Date().toISOString(),
    type: "job_description",
    storageFileName,
    mimeType: effectiveMime,
    extractedCharCount: extracted.length,
    ...(lowTextWarning ? { lowTextWarning: true } : {}),
    titleGuess: titleGuess ?? null,
    ...(geminiError ? { geminiError } : {}),
  };

  await writeFile(jdMetaPath(id), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export async function saveJobDescriptionFromFile(
  file: File,
): Promise<JobStoredMeta> {
  const name = file.name || "job-description";
  const mime = (file.type || "").toLowerCase();

  let buffer: Buffer;
  let effectiveMime: "application/pdf" | "text/plain";

  if (isPdfMime(mime, name)) {
    effectiveMime = "application/pdf";
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (isTextMime(mime, name)) {
    effectiveMime = "text/plain";
    buffer = Buffer.from(await file.arrayBuffer());
  } else {
    throw new StorageError(
      "Job description must be PDF or plain text (.txt)",
      "INVALID_TYPE",
    );
  }

  return persistJobDescriptionFromBuffer(buffer, name, effectiveMime, {});
}

export async function listJobDescriptions(): Promise<JobStoredMeta[]> {
  await initStorageDirs();
  const names = await readdir(jobDescriptionsDir());
  const metas: JobStoredMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    try {
      const raw = await readFile(
        path.join(jobDescriptionsDir(), name),
        "utf8",
      );
      const parsed = JSON.parse(raw) as JobStoredMeta;
      if (parsed.type === "job_description") metas.push(parsed);
    } catch {
      /* skip */
    }
  }
  metas.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );
  return metas;
}

export async function getJobMeta(id: string): Promise<JobStoredMeta | null> {
  await initStorageDirs();
  try {
    const raw = await readFile(jdMetaPath(id), "utf8");
    const parsed = JSON.parse(raw) as JobStoredMeta;
    return parsed.type === "job_description" ? parsed : null;
  } catch {
    return null;
  }
}

export async function readJobExtractedText(id: string): Promise<string | null> {
  const meta = await getJobMeta(id);
  if (!meta) return null;
  try {
    return await readFile(jdExtractedPath(id), "utf8");
  } catch {
    return null;
  }
}

export async function readJobFilePath(id: string): Promise<string | null> {
  const meta = await getJobMeta(id);
  if (!meta) return null;
  return path.join(jobDescriptionsDir(), meta.storageFileName);
}

export async function deleteJobDescription(id: string): Promise<boolean> {
  const meta = await getJobMeta(id);
  if (!meta) return false;
  const files = [
    path.join(jobDescriptionsDir(), meta.storageFileName),
    jdMetaPath(id),
    jdExtractedPath(id),
  ];
  for (const f of files) {
    try {
      await unlink(f);
    } catch {
      /* ignore */
    }
  }
  return true;
}

export async function saveJobDescriptionFromText(
  title: string,
  body: string,
  options: PersistJobDescriptionOptions = {},
): Promise<JobStoredMeta> {
  const safeName = `${sanitizeFilename(title) || "job-description"}.txt`;
  const buffer = Buffer.from(body, "utf8");
  const skip = options.skipTitleInference === true;
  return persistJobDescriptionFromBuffer(buffer, safeName, "text/plain", {
    skipTitleInference: skip,
    explicitTitleGuess: skip ? title.trim() || null : undefined,
  });
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
}
