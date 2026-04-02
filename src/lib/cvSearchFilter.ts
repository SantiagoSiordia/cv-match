import type { CvStoredMeta } from "@/lib/schemas";

function uploadDateUtcYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Lowercase haystack for client-side filtering. Prefers persisted `searchIndex`
 * (filename, dates, LLM fields, skills, résumé text slice); otherwise uses
 * metadata fields only.
 */
export function getCvSearchHaystack(cv: CvStoredMeta): string {
  if (cv.searchIndex?.trim()) return cv.searchIndex;
  return [
    cv.originalName,
    cv.gemini?.name ?? "",
    cv.gemini?.location ?? "",
    cv.gemini?.currentPosition ?? "",
    cv.gemini?.experienceSummary ?? "",
    uploadDateUtcYmd(cv.uploadedAt),
    cv.uploadedAt,
    ...(cv.gemini?.hardSkills ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/** Whitespace-separated tokens must all appear (AND), e.g. `react senior`. */
export function cvMatchesSearchQuery(cv: CvStoredMeta, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const hay = getCvSearchHaystack(cv);
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

/** Shared placeholder / aria-label for CV search fields. */
export const CV_SEARCH_FIELD_LABEL = "Search résumés";
