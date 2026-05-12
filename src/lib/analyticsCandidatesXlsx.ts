import * as XLSX from "xlsx";
import type { Range } from "xlsx";

import { buildAnalyticsCandidatesExportData } from "@/lib/analytics";
import {
  ANALYTICS_CANDIDATES_EXPORT_COLUMNS,
  ANALYTICS_CANDIDATES_JOB_ID_COLUMN_INDEX,
  type CandidatesExportColumnSpec,
} from "@/lib/analyticsCandidatesExportColumns";

/**
 * Vertical merges for Excel: role-level columns merge per job block; other columns merge
 * when adjacent rows share the same role and identical non-empty text. Columns marked
 * `disableAllMerges` are never merged.
 */
export function computeCandidatesSheetMerges(data: string[][]): Range[] {
  const merges: Range[] = [];
  const n = data.length;
  if (n === 0) return merges;

  const ncol = data[0]?.length ?? 0;
  const jobIdCol = ANALYTICS_CANDIDATES_JOB_ID_COLUMN_INDEX;

  const jobBlockCols: number[] = [];
  const disableMerge: boolean[] = [];
  for (let i = 0; i < ncol; i++) {
    const spec = ANALYTICS_CANDIDATES_EXPORT_COLUMNS[i] as
      | CandidatesExportColumnSpec
      | undefined;
    if (spec?.jobBlockMerge) jobBlockCols.push(i);
    disableMerge[i] = !!spec?.disableAllMerges;
  }

  let i = 0;
  while (i < n) {
    const jid = data[i]![jobIdCol];
    let j = i + 1;
    while (j < n && data[j]![jobIdCol] === jid) j++;
    const sheetStart = 1 + i;
    const sheetEnd = 1 + (j - 1);
    if (j - i >= 2) {
      for (const c of jobBlockCols) {
        merges.push({ s: { r: sheetStart, c }, e: { r: sheetEnd, c } });
      }
    }
    i = j;
  }

  for (let c = 0; c < ncol; c++) {
    if (disableMerge[c]) continue;
    const colSpec = ANALYTICS_CANDIDATES_EXPORT_COLUMNS[c] as
      | CandidatesExportColumnSpec
      | undefined;
    if (colSpec?.jobBlockMerge) continue;

    let r = 0;
    while (r < n) {
      const v = data[r]![c];
      if (v === "") {
        r++;
        continue;
      }
      const job = data[r]![jobIdCol];
      let r2 = r + 1;
      while (
        r2 < n &&
        data[r2]![c] === v &&
        data[r2]![jobIdCol] === job &&
        data[r2]![c] !== ""
      ) {
        r2++;
      }
      if (r2 - r >= 2) {
        merges.push({
          s: { r: 1 + r, c },
          e: { r: 1 + (r2 - 1), c },
        });
      }
      r = r2;
    }
  }

  return merges;
}

/** Keep only the top-left value of each merged region so Excel shows a single value. */
export function clearMergedInteriorsInPlace(
  data: string[][],
  merges: Range[],
): void {
  for (const m of merges) {
    for (let sheetR = m.s.r; sheetR <= m.e.r; sheetR++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (sheetR === m.s.r && c === m.s.c) continue;
        const di = sheetR - 1;
        const row = data[di];
        if (row && c < row.length) row[c] = "";
      }
    }
  }
}

export async function buildAnalyticsCandidatesXlsxBuffer(): Promise<{
  buffer: Buffer;
  generatedAt: string;
}> {
  const { headers, rows, generatedAt } = await buildAnalyticsCandidatesExportData();
  const data = rows.map((row) => [...row]);
  const merges = computeCandidatesSheetMerges(data);
  clearMergedInteriorsInPlace(data, merges);

  const aoa = [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = headers.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  const buffer = XLSX.write(wb, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;

  return { buffer, generatedAt };
}
