import { describe, expect, it } from "vitest";
import { cosineSimilarity, cosineToPercent } from "@/lib/embeddings";

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
