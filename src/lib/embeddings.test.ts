import { describe, expect, it } from "vitest";
import {
  compareCvMatchRowsForRanking,
  cosineSimilarity,
  cosineToPercent,
  selectJobVectorForCvMatrix,
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

describe("selectJobVectorForCvMatrix (cached analytics job-side vector)", () => {
  const fp = "abc123";
  const vQuery = [0, 1, 0];
  const vDoc = [1, 0, 0];

  it("uses query vector when queryFingerprint is missing (legacy index)", () => {
    const r = selectJobVectorForCvMatrix(
      { fingerprint: fp, values: vDoc, queryValues: vQuery },
      fp,
      false,
    );
    expect(r.vector).toBe(vQuery);
    expect(r.enqueueBedrockQueryEmbed).toBe(false);
  });

  it("uses query vector when queryFingerprint matches current JD hash", () => {
    const r = selectJobVectorForCvMatrix(
      {
        fingerprint: fp,
        values: vDoc,
        queryFingerprint: fp,
        queryValues: vQuery,
      },
      fp,
      false,
    );
    expect(r.vector).toBe(vQuery);
    expect(r.enqueueBedrockQueryEmbed).toBe(false);
  });

  it("uses document vector when query does not match but doc fingerprint matches", () => {
    const r = selectJobVectorForCvMatrix(
      {
        fingerprint: fp,
        values: vDoc,
        queryFingerprint: "stale",
        queryValues: vQuery,
      },
      fp,
      false,
    );
    expect(r.vector).toBe(vDoc);
    expect(r.enqueueBedrockQueryEmbed).toBe(false);
  });

  it("when not ensuring embeddings, still uses stale query vector if fingerprints disagree", () => {
    const r = selectJobVectorForCvMatrix(
      {
        fingerprint: "old-doc",
        values: vDoc,
        queryFingerprint: "stale-q",
        queryValues: vQuery,
      },
      fp,
      false,
    );
    expect(r.vector).toBe(vQuery);
    expect(r.enqueueBedrockQueryEmbed).toBe(false);
  });

  it("when not ensuring embeddings, falls back to stale document vector", () => {
    const r = selectJobVectorForCvMatrix(
      { fingerprint: "old", values: vDoc },
      fp,
      false,
    );
    expect(r.vector).toBe(vDoc);
    expect(r.enqueueBedrockQueryEmbed).toBe(false);
  });

  it("when ensuring embeddings and nothing matches, requests Bedrock query embed", () => {
    const r = selectJobVectorForCvMatrix(
      {
        fingerprint: "old",
        values: vDoc,
        queryFingerprint: "stale",
        queryValues: vQuery,
      },
      fp,
      true,
    );
    expect(r.vector).toBeUndefined();
    expect(r.enqueueBedrockQueryEmbed).toBe(true);
  });

  it("when index has no vectors, returns undefined without Bedrock", () => {
    const r = selectJobVectorForCvMatrix(undefined, fp, false);
    expect(r.vector).toBeUndefined();
    expect(r.enqueueBedrockQueryEmbed).toBe(false);
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
