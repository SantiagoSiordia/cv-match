import { describe, expect, it } from "vitest";
import { cvMatchesSearchQuery, getCvSearchHaystack } from "./cvSearchFilter";
import type { CvStoredMeta } from "./schemas";

function mockCv(partial: Partial<CvStoredMeta>): CvStoredMeta {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    originalName: "cv.pdf",
    uploadedAt: "2024-06-01T12:00:00.000Z",
    type: "cv",
    storageFileName: "x.pdf",
    extractedCharCount: 100,
    ...partial,
  };
}

describe("cvSearchFilter", () => {
  it("matches tokens against searchIndex when present", () => {
    const cv = mockCv({
      searchIndex: "jane doe react typescript senior engineer",
      originalName: "file.pdf",
    });
    expect(cvMatchesSearchQuery(cv, "react senior")).toBe(true);
    expect(cvMatchesSearchQuery(cv, "vue")).toBe(false);
  });

  it("falls back to metadata when searchIndex is missing", () => {
    const cv = mockCv({
      gemini: {
        name: "Jane Doe",
        title: "Staff Engineer",
        skills: ["Go", "Kubernetes"],
        experienceSummary: "Led platform team.",
      },
    });
    const hay = getCvSearchHaystack(cv);
    expect(hay).toContain("kubernetes");
    expect(cvMatchesSearchQuery(cv, "staff platform")).toBe(true);
  });

  it("empty query matches all", () => {
    const cv = mockCv({});
    expect(cvMatchesSearchQuery(cv, "   ")).toBe(true);
  });
});
