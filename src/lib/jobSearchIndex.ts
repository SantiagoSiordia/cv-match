const MAX_EXTRACT_CHARS = 14_000;

function uploadDateUtcYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Single lowercase string for search: file name, title guess, mime, dates,
 * optional error text, and a prefix of extracted JD body.
 */
export function buildJobSearchIndex(
  originalName: string,
  uploadedAtIso: string,
  titleGuess: string | null | undefined,
  mimeType: string,
  extractedText: string,
  geminiError?: string,
  geminiSkills?: string[],
): string {
  const base = (originalName || "")
    .replace(/\.(pdf|txt|json)$/i, "")
    .trim();
  const parts = [
    base,
    originalName || "",
    uploadedAtIso,
    uploadDateUtcYmd(uploadedAtIso),
    titleGuess ?? "",
    mimeType,
    geminiError ?? "",
    (geminiSkills ?? []).join(" "),
    extractedText.slice(0, MAX_EXTRACT_CHARS),
  ];
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
