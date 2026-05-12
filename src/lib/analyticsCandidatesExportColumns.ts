import type { JobStoredMeta } from "@/lib/schemas";

export type CandidatesExportColumnSpec = {
  readonly header: string;
  /** Same for every candidate row of a role → vertical merge in Excel. */
  readonly jobBlockMerge: boolean;
  /** Never merge this column (including “same value” runs). */
  readonly disableAllMerges?: boolean;
};

/**
 * Column order and Excel merge policy for the analytics candidates export.
 * `Role ID` is used to group rows by job when merging.
 */
export const ANALYTICS_CANDIDATES_EXPORT_COLUMNS = [
  { header: "Customer name", jobBlockMerge: true },
  { header: "Requirement branch", jobBlockMerge: true },
  { header: "Role ID", jobBlockMerge: true },
  { header: "Role title", jobBlockMerge: true },
  { header: "Requirement ID", jobBlockMerge: true },
  { header: "Role skills", jobBlockMerge: true },
  { header: "Rank", jobBlockMerge: false },
  { header: "Résumé file", jobBlockMerge: false },
  { header: "Text overlap %", jobBlockMerge: false },
  {
    header: "Text overlap label",
    jobBlockMerge: false,
    disableAllMerges: true,
  },
] as const satisfies readonly CandidatesExportColumnSpec[];

/** 0-based column index of `Role ID` (job UUID) for grouping. */
export const ANALYTICS_CANDIDATES_JOB_ID_COLUMN_INDEX = 2;

export function candidatesExportHeaders(): string[] {
  return ANALYTICS_CANDIDATES_EXPORT_COLUMNS.map((c) => c.header);
}

export function staffingStructuredField(
  structured: Record<string, string> | undefined,
  candidates: string[],
): string {
  if (!structured) return "";
  for (const name of candidates) {
    const v = structured[name];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  const byLower = new Map(
    Object.entries(structured).map(([k, v]) => [
      k.toLowerCase().trim(),
      String(v ?? "").trim(),
    ]),
  );
  for (const name of candidates) {
    const v = byLower.get(name.toLowerCase().trim());
    if (v) return v;
  }
  return "";
}

export function customerNameFromJob(job: JobStoredMeta | undefined): string {
  return staffingStructuredField(job?.structuredFields, [
    "Customer Name",
    "Customer name",
  ]);
}

export function requirementBranchFromJob(job: JobStoredMeta | undefined): string {
  return staffingStructuredField(job?.structuredFields, [
    "Requirement Branch",
    "Requirement branch",
    "Requirement Branch Name",
    "Branch",
    "Req Branch",
  ]);
}
