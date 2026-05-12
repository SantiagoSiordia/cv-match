import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({
  listCvs: vi.fn(async () => []),
  listJobDescriptions: vi.fn(async () => []),
  readCvExtractedText: vi.fn(async () => ""),
  readJobExtractedText: vi.fn(async () => ""),
}));

vi.mock("@/lib/evaluationsStore", () => ({
  listEvaluationRuns: vi.fn(async () => []),
}));

import { computeAnalyticsOverview } from "@/lib/analytics";
import * as embeddings from "@/lib/embeddings";

describe("computeAnalyticsOverview embedding warm-up (regression)", () => {
  it("calls warmAnalyticsJobEmbeddings, then warmAnalyticsCvEmbeddings, before buildJobCvMatrix", async () => {
    const warmJob = vi
      .spyOn(embeddings, "warmAnalyticsJobEmbeddings")
      .mockResolvedValue(undefined);
    const warmCv = vi
      .spyOn(embeddings, "warmAnalyticsCvEmbeddings")
      .mockResolvedValue(undefined);
    const matrix = vi
      .spyOn(embeddings, "buildJobCvMatrix")
      .mockResolvedValue([]);
    vi.spyOn(embeddings, "readCvEmbeddingIndexSnapshot").mockResolvedValue({
      model: "b:test-model:1024",
      updatedAt: undefined,
      entryCount: 0,
    });

    await computeAnalyticsOverview({
      thresholdEmbeddingPercent: 55,
      thresholdLlmOverall: 75,
    });

    expect(warmJob).toHaveBeenCalledTimes(1);
    expect(warmCv).toHaveBeenCalledTimes(1);
    expect(matrix).toHaveBeenCalledTimes(1);

    const j0 = warmJob.mock.invocationCallOrder[0]!;
    const c0 = warmCv.mock.invocationCallOrder[0]!;
    const m0 = matrix.mock.invocationCallOrder[0]!;
    expect(j0).toBeLessThan(c0);
    expect(c0).toBeLessThan(m0);
  });
});
