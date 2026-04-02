import { describe, expect, it } from "vitest";
import {
  runCvIdsInOrder,
  runMatchesOrderedCvIds,
} from "./evaluationsStore";
import type { EvaluationRun } from "./schemas";

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CV1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CV2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function mockRun(cvIds: string[]): EvaluationRun {
  return {
    id: RUN_ID,
    createdAt: "2025-01-01T00:00:00.000Z",
    jobDescriptionId: JOB_ID,
    jobTitle: "T",
    results: cvIds.map((cvId) => ({
      cvId,
      cvOriginalName: `${cvId}.pdf`,
      result: null,
    })),
  };
}

describe("evaluationsStore helpers", () => {
  it("runCvIdsInOrder preserves result order", () => {
    const run = mockRun([CV1, CV2]);
    expect(runCvIdsInOrder(run)).toEqual([CV1, CV2]);
  });

  it("runMatchesOrderedCvIds requires exact order match", () => {
    const run = mockRun([CV1, CV2]);
    expect(runMatchesOrderedCvIds(run, [CV1, CV2])).toBe(true);
    expect(runMatchesOrderedCvIds(run, [CV2, CV1])).toBe(false);
    expect(runMatchesOrderedCvIds(run, [CV1])).toBe(false);
    expect(runMatchesOrderedCvIds(undefined, [CV1])).toBe(false);
  });
});
