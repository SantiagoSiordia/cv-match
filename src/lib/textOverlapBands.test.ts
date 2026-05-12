import { describe, expect, it } from "vitest";
import {
  COSINE_STRONG_FROM,
  COSINE_WEAK_BELOW,
  textOverlapBandCsvLabel,
  textOverlapBandFromCosine,
} from "@/lib/textOverlapBands";

describe("textOverlapBandFromCosine", () => {
  it("clamps and maps extremes", () => {
    expect(textOverlapBandFromCosine(-1)).toBe("weak");
    expect(textOverlapBandFromCosine(2)).toBe("strong");
    expect(textOverlapBandFromCosine(-9)).toBe("weak");
  });

  it("uses weak below COSINE_WEAK_BELOW", () => {
    expect(textOverlapBandFromCosine(COSINE_WEAK_BELOW - 0.001)).toBe("weak");
    expect(textOverlapBandFromCosine(0)).toBe("weak");
  });

  it("uses moderate between weak and strong cutoffs", () => {
    expect(textOverlapBandFromCosine(COSINE_WEAK_BELOW)).toBe("moderate");
    expect(textOverlapBandFromCosine((COSINE_WEAK_BELOW + COSINE_STRONG_FROM) / 2)).toBe(
      "moderate",
    );
    expect(textOverlapBandFromCosine(COSINE_STRONG_FROM - 0.001)).toBe("moderate");
  });

  it("uses strong at and above COSINE_STRONG_FROM", () => {
    expect(textOverlapBandFromCosine(COSINE_STRONG_FROM)).toBe("strong");
    expect(textOverlapBandFromCosine(1)).toBe("strong");
  });
});

describe("textOverlapBandCsvLabel", () => {
  it("returns distinct labels", () => {
    expect(textOverlapBandCsvLabel("weak")).toBe("Weak overlap");
    expect(textOverlapBandCsvLabel("moderate")).toBe("Moderate overlap");
    expect(textOverlapBandCsvLabel("strong")).toBe("Strong overlap");
  });
});
