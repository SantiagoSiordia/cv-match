/**
 * Plain-language bands for embedding text overlap (cosine similarity).
 *
 * Displayed percentages use `((cosine + 1) / 2) * 100`, which clusters high for
 * typical résumé/job text pairs. These **cosine** cutoffs spread weak / moderate /
 * strong without changing ranking or threshold logic elsewhere.
 *
 * Tunable in one place only — adjust `COSINE_WEAK_BELOW` / `COSINE_STRONG_FROM`.
 */
export const COSINE_WEAK_BELOW = 0.55;
/** Inclusive: cosine >= this value is "strong". */
export const COSINE_STRONG_FROM = 0.72;

export type TextOverlapBand = "weak" | "moderate" | "strong";

/**
 * Maps cosine similarity in [-1, 1] to a band. Values outside the range are clamped.
 */
export function textOverlapBandFromCosine(sim: number): TextOverlapBand {
  const c = Math.min(1, Math.max(-1, sim));
  if (c < COSINE_WEAK_BELOW) return "weak";
  if (c < COSINE_STRONG_FROM) return "moderate";
  return "strong";
}

/** Short label for CSV / spreadsheets (ASCII). */
export function textOverlapBandCsvLabel(band: TextOverlapBand): string {
  switch (band) {
    case "weak":
      return "Weak overlap";
    case "moderate":
      return "Moderate overlap";
    case "strong":
      return "Strong overlap";
  }
}
