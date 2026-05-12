import { describe, expect, it } from "vitest";
import { buildJobComparisonReportMarkdown } from "@/lib/jobComparisonReportMarkdown";
import type { JobEmbeddingRankPayload } from "@/lib/jobEmbeddingRankPayload";

function minimalPayload(overrides: Partial<JobEmbeddingRankPayload> = {}): JobEmbeddingRankPayload {
  return {
    jobDescriptionId: "job-1",
    job: {} as JobEmbeddingRankPayload["job"],
    jobTitle: "Test role",
    jobText: "Line one\nLine two",
    jobRequiresTechnicalOrdering: false,
    matches: [
      {
        cvId: "cv-a",
        cvOriginalName: "a.pdf",
        scorePercent: 55,
        cosineSimilarity: 0.1,
      },
    ],
    meta: {
      embeddingModelId: "amazon.titan-embed-text-v2:0",
      embeddingIndexModelKey: "b:test:1024",
      embeddingIndexUpdatedAt: null,
      embeddingIndexEntryCount: 1,
      maxEmbeddingChars: 12000,
      jobQueryInputTruncated: false,
    },
    ...overrides,
  };
}

describe("buildJobComparisonReportMarkdown", () => {
  it("omits Tier column when technical ordering is off", () => {
    const md = buildJobComparisonReportMarkdown(minimalPayload());
    expect(md).toContain("[TOC]");
    expect(md).not.toContain("```mermaid");
    expect(md).not.toContain("How scores are computed");
    expect(md).not.toContain("md2pdf-mermaid");
    expect(md).toContain("| Rank | Score % | Cosine | Résumé |");
    expect(md).not.toContain("| Tier |");
    expect(md).toContain("| 1 | 55 | 0.1000 | a.pdf |");
  });

  it("shows technical tier when ordering applies", () => {
    const md = buildJobComparisonReportMarkdown(
      minimalPayload({
        jobRequiresTechnicalOrdering: true,
        matches: [
          {
            cvId: "cv-a",
            cvOriginalName: "a.pdf",
            scorePercent: 55,
            cosineSimilarity: 0.1,
            technicalBucket: "technical",
          },
        ],
      }),
    );
    expect(md).toContain("| 1 | 55 | 0.1000 | technical | a.pdf |");
  });

  it("does not duplicate title line when it matches the file name", () => {
    const md = buildJobComparisonReportMarkdown(
      minimalPayload({
        matches: [
          {
            cvId: "cv-a",
            cvOriginalName: "Jane-Doe.pdf",
            scorePercent: 60,
            cosineSimilarity: 0.2,
            cvDocumentTitleLine: "Jane-Doe",
          },
        ],
      }),
    );
    const line = md.split("\n").find((l) => l.includes("Jane-Doe.pdf"));
    expect(line).toBeDefined();
    expect(line!.match(/Jane-Doe/g)?.length).toBe(1);
  });

  it("extends code fence when job text contains triple backticks", () => {
    const md = buildJobComparisonReportMarkdown(
      minimalPayload({ jobText: "Hello ```world``` end" }),
    );
    expect(md).toContain("Hello ```world``` end");
    expect(md).toMatch(/\n`{4}text\n/);
  });
});
