import path from "node:path";

/** Resolve data directories at call time so tests can chdir safely. */
export function projectRoot(): string {
  return process.cwd();
}

/**
 * Root for uploads, evaluations, and embedding cache. In Docker/ECS, mount
 * EFS (or a volume) here — e.g. `CV_MATCH_DATA_ROOT=/data` — so data survives
 * outside the app image. Defaults to cwd when unset (local dev).
 */
export function dataRoot(): string {
  const fromEnv = process.env.CV_MATCH_DATA_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return projectRoot();
}

/** CV PDF files: `{uuid}.pdf` */
export function cvsPdfDir(): string {
  return path.join(dataRoot(), "cvs-pdf");
}

/** CV extracted plain text: `{uuid}.extracted.txt` */
export function cvsExtractedDir(): string {
  return path.join(dataRoot(), "cvs-extracted");
}

/** CV metadata JSON: `{uuid}.meta.json` */
export function cvsMetaDir(): string {
  return path.join(dataRoot(), "cvs-meta");
}

export function jobDescriptionsDir(): string {
  return path.join(dataRoot(), "job-descriptions");
}

export function evaluationsDir(): string {
  return path.join(dataRoot(), "evaluations");
}

/** Cached job embedding vectors (gitignored). */
export function embeddingsDir(): string {
  return path.join(dataRoot(), "embeddings");
}

export function jobEmbeddingIndexPath(): string {
  return path.join(embeddingsDir(), "job-index.json");
}
