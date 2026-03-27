import { describe, expect, it } from "vitest";
import { buildCvSearchIndex } from "@/lib/cvSearchIndex";

describe("buildCvSearchIndex", () => {
  it("includes filename, date, gemini fields, and extract snippet", () => {
    const idx = buildCvSearchIndex(
      "Jane-Doe-SWE.pdf",
      "2025-03-01T12:00:00.000Z",
      {
        name: "Jane Doe",
        title: "Software Engineer",
        skills: ["Rust", "Kubernetes"],
        experienceSummary: "Built APIs.",
      },
      "Led platform work with Postgres and Terraform.",
    );
    expect(idx).toContain("jane doe");
    expect(idx).toContain("software engineer");
    expect(idx).toContain("rust");
    expect(idx).toContain("postgres");
    expect(idx).toContain("2025-03-01");
  });
});
