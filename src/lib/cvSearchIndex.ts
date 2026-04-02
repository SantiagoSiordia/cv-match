import type { CvGeminiMeta } from "@/lib/schemas";

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
 * Single lowercase string for client search: file name, timestamps, LLM
 * fields, and a prefix of extracted résumé text (skills/terms mentioned in body).
 */
export function buildCvSearchIndex(
  originalName: string,
  uploadedAtIso: string,
  gemini: CvGeminiMeta | null | undefined,
  extractedText: string,
): string {
  const baseName = (originalName || "").replace(/\.pdf$/i, "").trim();
  const parts: string[] = [
    baseName,
    originalName || "",
    uploadedAtIso,
    uploadDateUtcYmd(uploadedAtIso),
    gemini?.name ?? "",
    gemini?.location ?? "",
    gemini?.currentPosition ?? "",
    gemini?.experienceSummary ?? "",
    ...(gemini?.hardSkills ?? []),
    extractedText.slice(0, MAX_EXTRACT_CHARS),
  ];
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
