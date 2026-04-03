import { describe, expect, it } from "vitest";
import type { EvaluationRun } from "@/lib/schemas";

/** Mirrors newestUsableLlmRunByJob in analytics.ts (not exported). */
function newestUsableLlmRunByJob(runs: EvaluationRun[]): Map<string, EvaluationRun> {
  function bestLlmFromRun(run: EvaluationRun) {
    let best: number | null = null;
    for (const r of run.results) {
      const s = r.result?.overallScore;
      if (s === undefined || s === null) continue;
      if (best === null || s > best) best = s;
    }
    return best;
  }
  const sorted = [...runs].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const map = new Map<string, EvaluationRun>();
  for (const run of sorted) {
    const jid = run.jobDescriptionId;
    if (map.has(jid)) continue;
    if (bestLlmFromRun(run) !== null) map.set(jid, run);
  }
  return map;
}

describe("newestUsableLlmRunByJob (analytics behavior)", () => {
  const job = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

  it("skips newest run when it has no scores and uses older run", () => {
    const older: EvaluationRun = {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2020-01-01T00:00:00.000Z",
      jobDescriptionId: job,
      results: [
        {
          cvId: "22222222-2222-4222-8222-222222222222",
          cvOriginalName: "a.pdf",
          result: {
            overallScore: 70,
            skillsMatch: 70,
            experienceRelevance: 70,
            educationFit: 70,
            strengths: [],
            gaps: [],
            summary: "",
          },
        },
      ],
    };
    const newerBad: EvaluationRun = {
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2025-01-01T00:00:00.000Z",
      jobDescriptionId: job,
      results: [
        {
          cvId: "22222222-2222-4222-8222-222222222222",
          cvOriginalName: "a.pdf",
          result: null,
          error: "AI failed",
        },
      ],
    };
    const map = newestUsableLlmRunByJob([older, newerBad]);
    expect(map.get(job)?.id).toBe(older.id);
  });

  it("uses newest run when it has scores", () => {
    const older = {
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2020-01-01T00:00:00.000Z",
      jobDescriptionId: job,
      results: [
        {
          cvId: "22222222-2222-4222-8222-222222222222",
          cvOriginalName: "a.pdf",
          result: {
            overallScore: 50,
            skillsMatch: 50,
            experienceRelevance: 50,
            educationFit: 50,
            strengths: [],
            gaps: [],
            summary: "",
          },
        },
      ],
    } satisfies EvaluationRun;
    const newer = {
      ...older,
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2025-01-01T00:00:00.000Z",
      results: [
        {
          cvId: "22222222-2222-4222-8222-222222222222",
          cvOriginalName: "a.pdf",
          result: {
            overallScore: 80,
            skillsMatch: 80,
            experienceRelevance: 80,
            educationFit: 80,
            strengths: [],
            gaps: [],
            summary: "",
          },
        },
      ],
    } satisfies EvaluationRun;
    const map = newestUsableLlmRunByJob([older, newer]);
    expect(map.get(job)?.id).toBe(newer.id);
  });
});
