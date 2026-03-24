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
  guessJobTitleWithGemini,
  GeminiConfigError,
} from "@/lib/gemini";
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

  const meta: CvStoredMeta = {
    id,
    originalName: originalName || "cv.pdf",
    uploadedAt: new Date().toISOString(),
    type: "cv",
    storageFileName,
    extractedCharCount: extracted.length,
    ...(lowTextWarning ? { lowTextWarning: true } : {}),
    gemini,
    ...(geminiError ? { geminiError } : {}),
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

export async function saveJobDescriptionFromFile(
  file: File,
): Promise<JobStoredMeta> {
  await initStorageDirs();
  assertSize(file.size);
  const name = file.name || "job-description";
  const mime = (file.type || "").toLowerCase();

  const id = randomUUID();
  let storageFileName: string;
  let buffer: Buffer;
  let effectiveMime: string;

  if (isPdfMime(mime, name)) {
    storageFileName = `${id}.pdf`;
    effectiveMime = "application/pdf";
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (isTextMime(mime, name)) {
    storageFileName = `${id}.txt`;
    effectiveMime = "text/plain";
    buffer = Buffer.from(await file.arrayBuffer());
  } else {
    throw new StorageError(
      "Job description must be PDF or plain text (.txt)",
      "INVALID_TYPE",
    );
  }

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
  await writeFile(
    jdExtractedPath(id),
    extracted,
    "utf8",
  );

  const lowTextWarning =
    extracted.length > 0 && extracted.length < LOW_TEXT_THRESHOLD_CHARS;

  let titleGuess: string | null | undefined;
  let geminiError: string | undefined;
  if (extracted.length > 0) {
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
    originalName: name,
    uploadedAt: new Date().toISOString(),
    type: "job_description",
    storageFileName,
    mimeType: effectiveMime,
    extractedCharCount: extracted.length,
    ...(lowTextWarning ? { lowTextWarning: true } : {}),
    titleGuess: titleGuess ?? null,
    ...(geminiError ? { geminiError } : {}),
  };

  await writeFile(
    jdMetaPath(id),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  return meta;
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
): Promise<JobStoredMeta> {
  const safeName = `${sanitizeFilename(title) || "job-description"}.txt`;
  const file = new File([body], safeName, { type: "text/plain" });
  return saveJobDescriptionFromFile(file);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
}
