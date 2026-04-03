import { parse } from "csv-parse/sync";

/** Normalize duplicate CSV headers (e.g. two "Skill Mapping" columns). */
export function dedupeHeaderNames(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((h) => {
    const raw = (h ?? "").trim() || "Column";
    const n = (counts.get(raw) ?? 0) + 1;
    counts.set(raw, n);
    return n === 1 ? raw : `${raw} (${n})`;
  });
}

function isPlaceholderValue(v: string): boolean {
  const t = v.trim();
  if (!t) return true;
  return /^not\s*available$/i.test(t);
}

export function isEffectivelyEmptyRow(row: Record<string, string>): boolean {
  return Object.values(row).every((v) => isPlaceholderValue(String(v)));
}

/** Human-readable JD text from structured columns (skips empty / "Not Available"). */
export function buildExtractedNarrativeFromRow(
  row: Record<string, string>,
): string {
  const lines: string[] = [];
  const keys = Object.keys(row).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    const v = String(row[k] ?? "").trim();
    if (isPlaceholderValue(v)) continue;
    lines.push(`${k}: ${v}`);
  }
  return lines.join("\n");
}

const SKILL_SPLIT = /[|,;/]+/;

function splitSkillTokens(s: string): string[] {
  return s
    .split(SKILL_SPLIT)
    .map((x) => x.trim())
    .filter(Boolean);
}

const SKILL_FIELD_HINTS =
  /skill|competency|sub sp|won sp|proficiency/i;

/** Collect skill-like tokens from known staffing-export columns. */
export function inferSkillsFromRow(row: Record<string, string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  function add(raw: string) {
    const t = raw.trim();
    if (!t || isPlaceholderValue(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  }

  for (const [col, val] of Object.entries(row)) {
    if (!SKILL_FIELD_HINTS.test(col)) continue;
    const v = String(val ?? "").trim();
    if (!v || isPlaceholderValue(v)) continue;
    for (const part of splitSkillTokens(v)) {
      add(part);
      if (out.length >= 40) return out;
    }
  }

  return out;
}

export function inferTitleGuessFromRow(row: Record<string, string>): string | null {
  const candidates = [
    row["Role"],
    row["Required Designation"],
    row["Opportunity Name"],
  ];
  for (const c of candidates) {
    const t = String(c ?? "").trim();
    if (t && !isPlaceholderValue(t)) return t;
  }
  return null;
}

export function sourceRequirementIdFromRow(
  row: Record<string, string>,
): string | undefined {
  const v = String(row["Requirement Id"] ?? "").trim();
  return v && !isPlaceholderValue(v) ? v : undefined;
}

/**
 * Parse CSV buffer into row objects with deduplicated column names.
 */
export function parseJobRequirementsCsv(
  buffer: Buffer,
): Record<string, string>[] {
  const input = buffer.toString("utf8");
  const records = parse(input, {
    columns: (header: string[]) =>
      dedupeHeaderNames(header.map((h) => String(h ?? "").trim() || "Column")),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];

  return records.filter((r) => !isEffectivelyEmptyRow(r));
}

export function rowOriginalDisplayName(
  sourceFileName: string,
  row: Record<string, string>,
): string {
  const base = sourceFileName.replace(/\.[^./\\]+$/i, "") || "requirements";
  const reqId = sourceRequirementIdFromRow(row);
  const safeBase = base.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
  return reqId
    ? `${safeBase}-req-${reqId}.json`
    : `${safeBase}-row.json`;
}
