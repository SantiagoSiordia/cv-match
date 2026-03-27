import type { JobStoredMeta } from "@/lib/schemas";

function uploadDateUtcYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Lowercase haystack for client filtering. Prefers persisted `searchIndex`
 * (file, title, extracted body slice); otherwise visible metadata only.
 */
export function getJobSearchHaystack(job: JobStoredMeta): string {
  if (job.searchIndex?.trim()) return job.searchIndex;
  return [
    job.originalName,
    job.titleGuess ?? "",
    job.mimeType,
    job.uploadedAt,
    uploadDateUtcYmd(job.uploadedAt),
    job.geminiError ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Whitespace-separated tokens must all appear (AND). */
export function jobMatchesSearchQuery(
  job: JobStoredMeta,
  query: string,
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const hay = getJobSearchHaystack(job);
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

export const JOB_SEARCH_FIELD_LABEL = "Search job descriptions";
