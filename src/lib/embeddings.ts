import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  DEFAULT_BEDROCK_EMBEDDING_MODEL,
  MAX_EMBEDDING_CHARS,
} from "@/lib/constants";
import {
  BedrockConfigError,
  generateTopMatchJustifications,
  getBedrockRuntimeClient,
} from "@/lib/bedrock";
import { embeddingsDir, jobEmbeddingIndexPath } from "@/lib/paths";
import {
  getCvMeta,
  listJobDescriptions,
  readCvExtractedText,
  readJobExtractedText,
} from "@/lib/storage";

export class EmbeddingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingApiError";
  }
}

function embeddingModelId(): string {
  return (
    process.env.BEDROCK_EMBEDDING_MODEL_ID?.trim() ||
    DEFAULT_BEDROCK_EMBEDDING_MODEL
  );
}

function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_EMBEDDING_CHARS) return text;
  return `${text.slice(0, MAX_EMBEDDING_CHARS)}\n\n[TRUNCATED]`;
}

/** Titan has no separate "document title" field; prepend a short title line when present. */
function documentEmbeddingInput(text: string, title?: string): string {
  const t = title?.trim();
  const body = truncateForEmbedding(text);
  if (t) return `${t.slice(0, 200)}\n\n${body}`;
  return body;
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

/** Concurrent Titan invokes per wave to balance throughput vs throttling. */
const EMBED_CONCURRENCY = 12;

async function invokeTitanEmbedding(inputText: string): Promise<number[]> {
  let client;
  try {
    client = getBedrockRuntimeClient();
  } catch (e) {
    if (e instanceof BedrockConfigError) throw e;
    throw new EmbeddingApiError(
      e instanceof Error ? e.message : "Bedrock client error",
    );
  }

  const modelId = embeddingModelId();
  const body = JSON.stringify({
    inputText,
    dimensions: 1024,
    normalize: true,
  });

  try {
    const out = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: new TextEncoder().encode(body),
      }),
    );
    const raw = new TextDecoder().decode(out.body as Uint8Array);
    const json = JSON.parse(raw) as { embedding?: number[] };
    const values = json.embedding;
    if (!values?.length) {
      throw new EmbeddingApiError("Embedding response missing values");
    }
    return values;
  } catch (e) {
    if (e instanceof BedrockConfigError || e instanceof EmbeddingApiError) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new EmbeddingApiError(`Embedding failed: ${msg}`);
  }
}

async function embedContentSingle(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
  title?: string,
): Promise<number[]> {
  const input =
    taskType === "RETRIEVAL_DOCUMENT"
      ? documentEmbeddingInput(text, title)
      : truncateForEmbedding(text);
  return invokeTitanEmbedding(input);
}

async function batchEmbedContents(
  requests: Array<{
    text: string;
    taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";
    title?: string;
  }>,
): Promise<number[][]> {
  const results: number[][] = new Array(requests.length);
  for (let i = 0; i < requests.length; i += EMBED_CONCURRENCY) {
    const slice = requests.slice(i, i + EMBED_CONCURRENCY);
    const vectors = await Promise.all(
      slice.map((r) =>
        embedContentSingle(r.text, r.taskType, r.title),
      ),
    );
    for (let j = 0; j < slice.length; j++) {
      results[i + j] = vectors[j]!;
    }
  }
  return results;
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

  const batchSize = 100;
  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const chunk = toEmbed.slice(i, i + batchSize);
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
