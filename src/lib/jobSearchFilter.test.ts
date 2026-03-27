import { describe, expect, it } from "vitest";
import {
  getJobSearchHaystack,
  jobMatchesSearchQuery,
} from "./jobSearchFilter";
import type { JobStoredMeta } from "./schemas";

function mockJob(partial: Partial<JobStoredMeta>): JobStoredMeta {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    originalName: "role.pdf",
    uploadedAt: "2024-06-01T12:00:00.000Z",
    type: "job_description",
    storageFileName: "x.pdf",
    mimeType: "application/pdf",
    extractedCharCount: 100,
    ...partial,
  };
}

describe("jobSearchFilter", () => {
  it("matches tokens against searchIndex when present", () => {
    const job = mockJob({
      searchIndex: "senior backend engineer golang kubernetes",
      originalName: "jd.pdf",
    });
    expect(jobMatchesSearchQuery(job, "backend golang")).toBe(true);
    expect(jobMatchesSearchQuery(job, "react")).toBe(false);
  });

  it("falls back to metadata when searchIndex is missing", () => {
    const job = mockJob({
      titleGuess: "Platform Engineer",
      originalName: "platform-role.pdf",
      mimeType: "application/pdf",
    });
    const hay = getJobSearchHaystack(job);
    expect(hay).toContain("platform");
    expect(jobMatchesSearchQuery(job, "platform engineer")).toBe(true);
  });

  it("empty query matches all", () => {
    const job = mockJob({});
    expect(jobMatchesSearchQuery(job, "   ")).toBe(true);
  });
});
