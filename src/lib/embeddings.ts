import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  DEFAULT_EMBEDDING_MODEL,
  MAX_EMBEDDING_CHARS,
} from "@/lib/constants";
import { embeddingsDir, jobEmbeddingIndexPath } from "@/lib/paths";
import {
  getCvMeta,
  listJobDescriptions,
  readCvExtractedText,
  readJobExtractedText,
} from "@/lib/storage";
import {
  GeminiConfigError,
  generateTopMatchJustifications,
} from "@/lib/gemini";

export class EmbeddingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingApiError";
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new GeminiConfigError();
  }
  return key;
}

function embeddingModelId(): string {
  return process.env.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_EMBEDDING_CHARS) return text;
  return `${text.slice(0, MAX_EMBEDDING_CHARS)}\n\n[TRUNCATED]`;
}

export function fingerprintText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Cosine similarity for two vectors (any finite length; returns 0 on mismatch).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Maps cosine similarity in [-1, 1] to an integer percentage 0–100 for display.
 */
export function cosineToPercent(sim: number): number {
  const clamped = Math.min(1, Math.max(-1, sim));
  return Math.round(((clamped + 1) / 2) * 100);
}

type JobIndexEntry = {
  fingerprint: string;
  values: number[];
};

type JobIndexFile = {
  model: string;
  entries: Record<string, JobIndexEntry>;
};

const BATCH_SIZE = 100;

async function embedContentSingle(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  title?: string,
): Promise<number[]> {
  const key = getApiKey();
  const model = embeddingModelId();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(key)}`;
  const body: Record<string, unknown> = {
    model: `models/${model}`,
    content: { parts: [{ text: truncateForEmbedding(text) }] },
    taskType,
  };
  if (title && taskType === "RETRIEVAL_DOCUMENT") {
    body.title = title.slice(0, 200);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new EmbeddingApiError(`Embedding failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as {
    embedding?: { values?: number[] };
  };
  const values = json.embedding?.values;
  if (!values?.length) {
    throw new EmbeddingApiError("Embedding response missing values");
  }
  return values;
}

async function batchEmbedContents(
  requests: Array<{
    text: string;
    taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";
    title?: string;
  }>,
): Promise<number[][]> {
  const key = getApiKey();
  const model = embeddingModelId();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${encodeURIComponent(key)}`;
  const body = {
    requests: requests.map((r) => {
      const req: Record<string, unknown> = {
        model: `models/${model}`,
        content: { parts: [{ text: truncateForEmbedding(r.text) }] },
        taskType: r.taskType,
      };
      if (r.title && r.taskType === "RETRIEVAL_DOCUMENT") {
        req.title = r.title.slice(0, 200);
      }
      return req;
    }),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new EmbeddingApiError(
      `Batch embedding failed: ${res.status} ${errText}`,
    );
  }
  const json = (await res.json()) as {
    embeddings?: Array<{ values?: number[] }>;
  };
  const embs = json.embeddings;
  if (!embs || embs.length !== requests.length) {
    throw new EmbeddingApiError("Batch embedding response length mismatch");
  }
  return embs.map((e, i) => {
    const v = e.values;
    if (!v?.length) {
      throw new EmbeddingApiError(`Missing embedding at index ${i}`);
    }
    return v;
  });
}

async function loadJobIndex(): Promise<JobIndexFile> {
  try {
    const raw = await readFile(jobEmbeddingIndexPath(), "utf8");
    const parsed = JSON.parse(raw) as JobIndexFile;
    if (
      typeof parsed.model === "string" &&
      parsed.entries &&
      typeof parsed.entries === "object"
    ) {
      return parsed;
    }
  } catch {
    /* missing or invalid */
  }
  return { model: embeddingModelId(), entries: {} };
}

async function saveJobIndex(index: JobIndexFile): Promise<void> {
  await mkdir(embeddingsDir(), { recursive: true });
  await writeFile(jobEmbeddingIndexPath(), JSON.stringify(index), "utf8");
}

/**
 * Ensures on-disk vectors exist for every job with extractable text.
 * Invalidates entries when JD text changes (SHA-256 fingerprint).
 */
export async function ensureJobEmbeddingIndex(): Promise<JobIndexFile> {
  const jobs = await listJobDescriptions();
  let index = await loadJobIndex();
  const model = embeddingModelId();
  if (index.model !== model) {
    index = { model, entries: {} };
  }

  const toEmbed: Array<{
    id: string;
    text: string;
    title: string;
    fingerprint: string;
  }> = [];

  for (const job of jobs) {
    const text = (await readJobExtractedText(job.id)) ?? "";
    if (!text.trim()) continue;
    const fp = fingerprintText(text);
    const existing = index.entries[job.id];
    if (existing && existing.fingerprint === fp && existing.values.length > 0) {
      continue;
    }
    const title =
      job.titleGuess?.trim() ||
      job.originalName.replace(/\.[^.]+$/, "") ||
      "Job";
    toEmbed.push({ id: job.id, text, title, fingerprint: fp });
  }

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const chunk = toEmbed.slice(i, i + BATCH_SIZE);
    const vectors = await batchEmbedContents(
      chunk.map((c) => ({
        text: c.text,
        taskType: "RETRIEVAL_DOCUMENT" as const,
        title: c.title,
      })),
    );
    for (let j = 0; j < chunk.length; j++) {
      const c = chunk[j]!;
      index.entries[c.id] = {
        fingerprint: c.fingerprint,
        values: vectors[j]!,
      };
    }
  }

  const jobIds = new Set(jobs.map((j) => j.id));
  for (const id of Object.keys(index.entries)) {
    if (!jobIds.has(id)) delete index.entries[id];
  }

  await saveJobIndex(index);
  return index;
}

export type JobMatchRow = {
  jobDescriptionId: string;
  title: string;
  scorePercent: number;
  cosineSimilarity: number;
  skipped?: boolean;
  skipReason?: string;
  /** Short LLM explanation of the score; only set for the top non-skipped matches. */
  justification?: string;
};

export async function rankCvAgainstJobs(cvId: string): Promise<JobMatchRow[]> {
  const cvMeta = await getCvMeta(cvId);
  if (!cvMeta) {
    throw new Error("CV_NOT_FOUND");
  }
  const cvText = await readCvExtractedText(cvId);
  if (!cvText?.trim()) {
    throw new Error("CV_TEXT_MISSING");
  }

  const index = await ensureJobEmbeddingIndex();
  const cvVec = await embedContentSingle(cvText, "RETRIEVAL_QUERY");

  const jobs = await listJobDescriptions();
  const rows: JobMatchRow[] = [];

  for (const job of jobs) {
    const title =
      job.titleGuess?.trim() ||
      job.originalName.replace(/\.[^.]+$/, "") ||
      "Job";
    const entry = index.entries[job.id];
    const jdText = await readJobExtractedText(job.id);
    if (!jdText?.trim()) {
      rows.push({
        jobDescriptionId: job.id,
        title,
        scorePercent: 0,
        cosineSimilarity: 0,
        skipped: true,
        skipReason: "no_extracted_text",
      });
      continue;
    }
    if (!entry?.values.length) {
      rows.push({
        jobDescriptionId: job.id,
        title,
        scorePercent: 0,
        cosineSimilarity: 0,
        skipped: true,
        skipReason: "embedding_missing",
      });
      continue;
    }
    const sim = cosineSimilarity(cvVec, entry.values);
    rows.push({
      jobDescriptionId: job.id,
      title,
      scorePercent: cosineToPercent(sim),
      cosineSimilarity: sim,
    });
  }

  rows.sort((a, b) => b.scorePercent - a.scorePercent);
  return rows;
}

/**
 * Adds optional `justification` prose for the first three **non-skipped** rows
 * in the already-sorted list (the visible top matches).
 */
export async function enrichTopMatchJustifications(
  cvId: string,
  rows: JobMatchRow[],
): Promise<JobMatchRow[]> {
  const top = rows.filter((r) => !r.skipped).slice(0, 3);
  if (top.length === 0) return rows;

  try {
    const cvText = await readCvExtractedText(cvId);
    if (!cvText?.trim()) return rows;

    const payloads = await Promise.all(
      top.map(async (r) => {
        const jdText = (await readJobExtractedText(r.jobDescriptionId)) ?? "";
        return {
          jobDescriptionId: r.jobDescriptionId,
          title: r.title,
          scorePercent: r.scorePercent,
          jdText,
        };
      }),
    );

    const withText = payloads.filter((p) => p.jdText.trim());
    if (withText.length === 0) return rows;

    const map = await generateTopMatchJustifications(cvText, withText);

    return rows.map((row) => {
      const justification = map.get(row.jobDescriptionId);
      if (!justification) return row;
      return { ...row, justification };
    });
  } catch (e) {
    console.error("enrichTopMatchJustifications", e);
    return rows;
  }
}
