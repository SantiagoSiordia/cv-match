import { describe, expect, it } from "vitest";

import {
  customerNameFromJob,
  requirementBranchFromJob,
} from "@/lib/analyticsCandidatesExportColumns";
import type { JobStoredMeta } from "@/lib/schemas";

function job(structuredFields: Record<string, string>): JobStoredMeta {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    originalName: "x.pdf",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    type: "job_description",
    storageFileName: "x",
    mimeType: "application/pdf",
    extractedCharCount: 0,
    structuredFields,
  } as JobStoredMeta;
}

describe("customerNameFromJob / requirementBranchFromJob", () => {
  it("reads canonical staffing column names from structuredFields", () => {
    const j = job({
      "Customer Name": " Contoso ",
      "Requirement Branch": "EMEA",
    });
    expect(customerNameFromJob(j)).toBe("Contoso");
    expect(requirementBranchFromJob(j)).toBe("EMEA");
  });

  it("matches case-insensitively when needed", () => {
    const j = job({
      "customer name": "Fabrikam",
      "requirement branch": "Americas",
    });
    expect(customerNameFromJob(j)).toBe("Fabrikam");
    expect(requirementBranchFromJob(j)).toBe("Americas");
  });
});
