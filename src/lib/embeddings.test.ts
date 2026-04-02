import { describe, expect, it } from "vitest";
import {
  compareCvMatchRowsForRanking,
  cosineSimilarity,
  cosineToPercent,
} from "@/lib/embeddings";
import type { CvMatchRow } from "@/lib/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns 0 for length mismatch", () => {
    expect(cosineSimilarity([1], [1, 1])).toBe(0);
  });
});

describe("cosineToPercent", () => {
  it("maps -1 to 0 and 1 to 100", () => {
    expect(cosineToPercent(-1)).toBe(0);
    expect(cosineToPercent(1)).toBe(100);
  });

  it("maps 0 to 50", () => {
    expect(cosineToPercent(0)).toBe(50);
  });
});

describe("compareCvMatchRowsForRanking", () => {
  function row(
    partial: Pick<CvMatchRow, "cvId"> &
      Partial<Omit<CvMatchRow, "cvId">>,
  ): CvMatchRow {
    return {
      cvId: partial.cvId,
      cvOriginalName: partial.cvOriginalName ?? "x.pdf",
      scorePercent: partial.scorePercent ?? 0,
      cosineSimilarity: partial.cosineSimilarity ?? 0,
      skipped: partial.skipped,
      skipReason: partial.skipReason,
    };
  }

  it("breaks scorePercent ties with cosineSimilarity, not cv list order", () => {
    const newer = row({
      cvId: "zzz-new",
      scorePercent: 50,
      cosineSimilarity: 0,
    });
    const older = row({
      cvId: "aaa-old",
      scorePercent: 50,
      cosineSimilarity: 0.001,
    });
    const sorted = [newer, older].sort(compareCvMatchRowsForRanking);
    expect(sorted[0]!.cvId).toBe("aaa-old");
  });

  it("uses cvId when score and cosine tie", () => {
    const b = row({ cvId: "b", scorePercent: 50, cosineSimilarity: 0 });
    const a = row({ cvId: "a", scorePercent: 50, cosineSimilarity: 0 });
    const sorted = [b, a].sort(compareCvMatchRowsForRanking);
    expect(sorted.map((r) => r.cvId)).toEqual(["a", "b"]);
  });

  it("places non-skipped rows before skipped when scores tie", () => {
    const ok = row({
      cvId: "ok",
      scorePercent: 0,
      cosineSimilarity: 0,
      skipped: false,
    });
    const bad = row({
      cvId: "bad",
      scorePercent: 0,
      cosineSimilarity: 0,
      skipped: true,
      skipReason: "x",
    });
    const sorted = [bad, ok].sort(compareCvMatchRowsForRanking);
    expect(sorted[0]!.cvId).toBe("ok");
  });
});
