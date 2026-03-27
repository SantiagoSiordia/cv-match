import path from "node:path";

/** Resolve data directories at call time so tests can chdir safely. */
export function projectRoot(): string {
  return process.cwd();
}

/** CV PDF files: `{uuid}.pdf` */
export function cvsPdfDir(): string {
  return path.join(projectRoot(), "cvs-pdf");
}

/** CV extracted plain text: `{uuid}.extracted.txt` */
export function cvsExtractedDir(): string {
  return path.join(projectRoot(), "cvs-extracted");
}

/** CV metadata JSON: `{uuid}.meta.json` */
export function cvsMetaDir(): string {
  return path.join(projectRoot(), "cvs-meta");
}

export function jobDescriptionsDir(): string {
  return path.join(projectRoot(), "job-descriptions");
}

export function evaluationsDir(): string {
  return path.join(projectRoot(), "evaluations");
}

/** Cached job embedding vectors (gitignored). */
export function embeddingsDir(): string {
  return path.join(projectRoot(), "embeddings");
}

export function jobEmbeddingIndexPath(): string {
  return path.join(embeddingsDir(), "job-index.json");
}
