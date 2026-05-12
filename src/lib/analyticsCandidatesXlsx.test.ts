import { describe, expect, it } from "vitest";

import {
  clearMergedInteriorsInPlace,
  computeCandidatesSheetMerges,
} from "@/lib/analyticsCandidatesXlsx";
import { ANALYTICS_CANDIDATES_JOB_ID_COLUMN_INDEX } from "@/lib/analyticsCandidatesExportColumns";

const JID = ANALYTICS_CANDIDATES_JOB_ID_COLUMN_INDEX;

/** Ten-column candidates export row (see `ANALYTICS_CANDIDATES_EXPORT_COLUMNS`). */
function row(
  customer: string,
  branch: string,
  jobId: string,
  title: string,
  reqId: string,
  skills: string,
  rank: string,
  file: string,
  pct: string,
  label: string,
): string[] {
  return [customer, branch, jobId, title, reqId, skills, rank, file, pct, label];
}

describe("computeCandidatesSheetMerges", () => {
  it("merges job-block columns per role and same-value columns, but never merges Text overlap label", () => {
    const data: string[][] = [
      row("Acme", "East", "job-a", "Role A", "R1", "Go", "1", "a.pdf", "80", "Strong overlap"),
      row("Acme", "East", "job-a", "Role A", "R1", "Go", "2", "b.pdf", "80", "Strong overlap"),
      row("Other", "West", "job-b", "Role B", "R2", "Rust", "1", "a.pdf", "50", "Weak overlap"),
    ];

    const merges = computeCandidatesSheetMerges(data);
    const hasMerge = (r0: number, r1: number, c: number) =>
      merges.some(
        (m) =>
          m.s.r === r0 && m.s.c === c && m.e.r === r1 && m.e.c === c,
      );

    expect(JID).toBe(2);
    expect(hasMerge(1, 2, 0)).toBe(true);
    expect(hasMerge(1, 2, 2)).toBe(true);
    expect(hasMerge(1, 2, 8)).toBe(true);
    expect(hasMerge(1, 2, 9)).toBe(false);
    const labelMerges = merges.filter((m) => m.s.c === 9 && m.s.r !== m.e.r);
    expect(labelMerges.length).toBe(0);
  });
});

describe("clearMergedInteriorsInPlace", () => {
  it("clears non-top-left cells inside merge rectangles", () => {
    const data: string[][] = [
      row("X", "Y", "j", "t", "", "", "1", "f", "10", "L"),
      row("X", "Y", "j", "t", "", "", "2", "g", "10", "L"),
    ];
    const merges = computeCandidatesSheetMerges(data);
    clearMergedInteriorsInPlace(data, merges);
    expect(data[0]![0]).toBe("X");
    expect(data[1]![0]).toBe("");
    expect(data[0]![9]).toBe("L");
    expect(data[1]![9]).toBe("L");
  });
});
