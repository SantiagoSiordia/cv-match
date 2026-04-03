import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  LOW_TEXT_THRESHOLD_CHARS,
  MAX_UPLOAD_BYTES,
  maxCsvJobRows,
} from "@/lib/constants";
import {
  buildExtractedNarrativeFromRow,
  inferSkillsFromRow,
  inferTitleGuessFromRow,
  parseJobRequirementsCsv,
  rowOriginalDisplayName,
  sourceRequirementIdFromRow,
} from "@/lib/csvJobRequirements";
import {
  cvsExtractedDir,
  cvsMetaDir,
  cvsPdfDir,
  evaluationsDir,
  jobDescriptionsDir,
} from "@/lib/paths";
import { extractTextFromPdf, extractTextFromPlainBuffer } from "@/lib/extractText";
import {
  AiProviderConfigError,
  extractCvMetadataWithProvider,
  extractJobSkillsWithProvider,
  GeminiConfigError,
  guessCvTitleWithProvider,
  guessJobTitleWithProvider,
} from "@/lib/aiProvider";
import { buildCvSearchIndex } from "@/lib/cvSearchIndex";
import { buildJobSearchIndex } from "@/lib/jobSearchIndex";
import { cvGeminiMetaSchema, type CvStoredMeta, type JobStoredMeta } from "@/lib/schemas";

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "FILE_TOO_LARGE"
      | "INVALID_TYPE"
      | "NOT_FOUND"
      | "READ_FAILED"
      | "CSV_TOO_MANY_ROWS",
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
 * Persist a CV PDF with extracted text and optional LLM metadata (Bedrock preferred, Gemini fallback).
 * Use `skipAi: true` for bulk imports to avoid API cost/latency.
 */
export async function persistCvPdf(
  buffer: Buffer,
  originalName: string,
  options: { skipAi?: boolean } = {},
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

  const skipAi = options.skipAi === true;
  let gemini: CvStoredMeta["gemini"] = null;
  let geminiError: string | undefined;

  if (!skipAi) {
    if (extracted.length > 0) {
      try {
        gemini = await extractCvMetadataWithProvider(extracted);
      } catch (e) {
        gemini = null;
        if (
          e instanceof AiProviderConfigError ||
          e instanceof GeminiConfigError
        ) {
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
  return persistCvPdf(buffer, file.name || "cv.pdf", { skipAi: false });
}

function coerceGeminiOnMeta(meta: CvStoredMeta): CvStoredMeta {
  if (!meta.gemini) return meta;
  const r = cvGeminiMetaSchema.safeParse(meta.gemini);
  if (!r.success) return meta;
  return { ...meta, gemini: r.data };
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
      if (parsed.type === "cv") metas.push(coerceGeminiOnMeta(parsed));
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
    if (parsed.type !== "cv") return null;
    return coerceGeminiOnMeta(parsed);
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

/** True when we should run full LLM extraction (missing or thin metadata). */
function cvNeedsGeminiBackfill(meta: CvStoredMeta): boolean {
  if (!meta.gemini) return true;
  const parsed = cvGeminiMetaSchema.safeParse(meta.gemini);
  const g = parsed.success ? parsed.data : null;
  if (!g) return true;
  const hasIdentity = !!(g.name.trim() || g.currentPosition.trim());
  if (!hasIdentity) return true;
  if (g.hardSkills.length === 0) return true;
  if (!g.experienceSummary.trim()) return true;
  return false;
}

/**
 * Before job matching: backfill LLM metadata (name, location, currentPosition,
 * hardSkills, experienceSummary) when incomplete, then infer currentPosition if
 * still missing. Updates `searchIndex`. Re-throws
 * `AiProviderConfigError` / `GeminiConfigError` when no LLM provider is available.
 * On extraction failure with no prior gemini blob, sets `geminiError` and still returns
 * meta for the match to proceed.
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
      gemini = await extractCvMetadataWithProvider(text);
      geminiError = undefined;
      changed = true;
    } catch (e) {
      if (e instanceof AiProviderConfigError || e instanceof GeminiConfigError) {
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

  if (gemini && !gemini.currentPosition.trim()) {
    try {
      const pos = await guessCvTitleWithProvider(text);
      if (pos?.trim()) {
        gemini = { ...gemini, currentPosition: pos.trim() };
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

export async function deleteAllCvs(): Promise<number> {
  const items = await listCvs();
  let n = 0;
  for (const c of items) {
    if (await deleteCv(c.id)) n++;
  }
  return n;
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

export function isCsvFile(mime: string, name: string): boolean {
  const m = mime.toLowerCase();
  if (
    m === "text/csv" ||
    m === "application/csv" ||
    m === "application/vnd.ms-excel"
  ) {
    return true;
  }
  return name.toLowerCase().endsWith(".csv");
}

export type PersistJobDescriptionOptions = {
  /** When true, do not call the LLM for title; use `explicitTitleGuess` or null. */
  skipTitleInference?: boolean;
  /** Used when `skipTitleInference` is true (e.g. bulk import with known title). */
  explicitTitleGuess?: string | null;
  /** When true, skip JD skill extraction (saves API calls on bulk import). */
  skipSkillExtraction?: boolean;
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
  const skipSkillExtraction = options.skipSkillExtraction === true;
  let titleGuess: string | null | undefined;
  let geminiError: string | undefined;
  let geminiSkills: string[] | undefined;
  let geminiSkillsError: string | undefined;

  if (skipTitle) {
    const t = options.explicitTitleGuess?.trim();
    titleGuess = t?.length ? t : null;
    if (extracted.length === 0) {
      geminiError = extractError ?? "No text extracted";
    }
  } else if (extracted.length > 0) {
    try {
      titleGuess = await guessJobTitleWithProvider(extracted);
    } catch (e) {
      if (e instanceof AiProviderConfigError || e instanceof GeminiConfigError) {
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

  if (
    !skipTitle &&
    !skipSkillExtraction &&
    extracted.length > 0 &&
    !geminiError
  ) {
    try {
      const out = await extractJobSkillsWithProvider(extracted);
      geminiSkills = out.skills;
    } catch (e) {
      if (e instanceof AiProviderConfigError || e instanceof GeminiConfigError) {
        geminiSkillsError = e.message;
      } else if (e instanceof Error) {
        geminiSkillsError = e.message;
      } else {
        geminiSkillsError = "Skill extraction failed";
      }
    }
  }

  const uploadedAt = new Date().toISOString();
  const meta: JobStoredMeta = {
    id,
    originalName: originalName || "job-description",
    uploadedAt,
    type: "job_description",
    storageFileName,
    mimeType: effectiveMime,
    extractedCharCount: extracted.length,
    ...(lowTextWarning ? { lowTextWarning: true } : {}),
    titleGuess: titleGuess ?? null,
    ...(geminiSkills?.length ? { geminiSkills } : {}),
    ...(geminiSkillsError ? { geminiSkillsError } : {}),
    ...(geminiError ? { geminiError } : {}),
    searchIndex: buildJobSearchIndex(
      originalName || "job-description",
      uploadedAt,
      titleGuess ?? null,
      effectiveMime,
      extracted,
      geminiError,
      geminiSkills,
    ),
  };

  await writeFile(jdMetaPath(id), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export async function persistJobDescriptionFromCsvRow(input: {
  structuredFields: Record<string, string>;
  extracted: string;
  originalName: string;
  sourceFileName: string;
  sourceRequirementId?: string;
  titleGuess: string | null;
  geminiSkills: string[];
}): Promise<JobStoredMeta> {
  await initStorageDirs();
  const id = randomUUID();
  const storageFileName = `${id}.json`;
  const payload = {
    sourceFileName: input.sourceFileName,
    sourceRequirementId: input.sourceRequirementId,
    structuredFields: input.structuredFields,
  };
  await writeFile(
    path.join(jobDescriptionsDir(), storageFileName),
    JSON.stringify(payload, null, 2),
    "utf8",
  );

  await writeFile(jdExtractedPath(id), input.extracted, "utf8");

  const lowTextWarning =
    input.extracted.length > 0 &&
    input.extracted.length < LOW_TEXT_THRESHOLD_CHARS;

  const uploadedAt = new Date().toISOString();
  const meta: JobStoredMeta = {
    id,
    originalName: input.originalName,
    uploadedAt,
    type: "job_description",
    storageFileName,
    mimeType: "application/json",
    extractedCharCount: input.extracted.length,
    ...(lowTextWarning ? { lowTextWarning: true } : {}),
    titleGuess: input.titleGuess,
    sourceKind: "csv_row",
    structuredFields: input.structuredFields,
    ...(input.sourceRequirementId
      ? { sourceRequirementId: input.sourceRequirementId }
      : {}),
    ...(input.geminiSkills.length ? { geminiSkills: input.geminiSkills } : {}),
    searchIndex: buildJobSearchIndex(
      input.originalName,
      uploadedAt,
      input.titleGuess,
      "application/json",
      input.extracted,
      undefined,
      input.geminiSkills,
    ),
  };

  await writeFile(jdMetaPath(id), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

export type CsvJobImportRowError = {
  fileName: string;
  code: string;
  message: string;
};

/**
 * One stored job per CSV data row. Row-level failures are collected in `errors`.
 */
export async function saveJobDescriptionsFromCsvFile(file: File): Promise<{
  items: JobStoredMeta[];
  errors: CsvJobImportRowError[];
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  assertSize(buffer.length);
  const sourceFileName = file.name || "requirements.csv";

  let records: Record<string, string>[];
  try {
    records = parseJobRequirementsCsv(buffer);
  } catch {
    throw new StorageError("Could not parse CSV", "INVALID_TYPE");
  }

  if (records.length === 0) {
    throw new StorageError("CSV has no data rows", "INVALID_TYPE");
  }

  const limit = maxCsvJobRows();
  if (records.length > limit) {
    throw new StorageError(
      `CSV has ${records.length} rows; maximum is ${limit}. Set MAX_CSV_JOB_ROWS to raise the limit.`,
      "CSV_TOO_MANY_ROWS",
    );
  }

  const items: JobStoredMeta[] = [];
  const errors: CsvJobImportRowError[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const extracted = buildExtractedNarrativeFromRow(row);
      const titleGuess = inferTitleGuessFromRow(row);
      const geminiSkills = inferSkillsFromRow(row);
      const sourceRequirementId = sourceRequirementIdFromRow(row);
      const originalName = rowOriginalDisplayName(sourceFileName, row);

      const meta = await persistJobDescriptionFromCsvRow({
        structuredFields: { ...row },
        extracted,
        originalName,
        sourceFileName,
        sourceRequirementId,
        titleGuess,
        geminiSkills,
      });
      items.push(meta);
    } catch (e) {
      errors.push({
        fileName: `${sourceFileName} (row ${rowNum})`,
        code: "UPLOAD_FAILED",
        message:
          e instanceof Error ? e.message : "Could not save job from CSV row",
      });
    }
  }

  return { items, errors };
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

export async function saveJobMeta(meta: JobStoredMeta): Promise<void> {
  await initStorageDirs();
  const extracted = (await readJobExtractedText(meta.id)) ?? "";
  const full: JobStoredMeta = {
    ...meta,
    searchIndex: buildJobSearchIndex(
      meta.originalName,
      meta.uploadedAt,
      meta.titleGuess ?? null,
      meta.mimeType,
      extracted,
      meta.geminiError,
      meta.geminiSkills,
    ),
  };
  await writeFile(jdMetaPath(meta.id), JSON.stringify(full, null, 2), "utf8");
}

/**
 * Runs LLM skill extraction for one job and persists `geminiSkills` / `geminiSkillsError`.
 */
export async function backfillJobSkillsForJob(jobId: string): Promise<
  | { ok: true; skills: string[] }
  | { ok: false; error: string }
> {
  const meta = await getJobMeta(jobId);
  if (!meta) return { ok: false, error: "NOT_FOUND" };
  const text = await readJobExtractedText(jobId);
  if (!text?.trim()) return { ok: false, error: "NO_TEXT" };
  try {
    const { skills } = await extractJobSkillsWithProvider(text);
    const next: JobStoredMeta = { ...meta, geminiSkills: skills };
    delete next.geminiSkillsError;
    await saveJobMeta(next);
    return { ok: true, skills };
  } catch (e) {
    const msg =
      e instanceof AiProviderConfigError || e instanceof GeminiConfigError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Skill extraction failed";
    const next: JobStoredMeta = {
      ...meta,
      geminiSkillsError: msg,
    };
    await saveJobMeta(next);
    return { ok: false, error: msg };
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

export async function deleteAllJobDescriptions(): Promise<number> {
  const items = await listJobDescriptions();
  let n = 0;
  for (const j of items) {
    if (await deleteJobDescription(j.id)) n++;
  }
  return n;
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
