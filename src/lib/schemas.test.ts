import { describe, expect, it } from "vitest";
import {
  compatibilityBatchResponseSchema,
  cvGeminiMetaSchema,
} from "@/lib/schemas";

describe("cvGeminiMetaSchema", () => {
  it("normalizes new LLM shape with empty defaults", () => {
    const out = cvGeminiMetaSchema.parse({
      name: "",
      location: "",
      currentPosition: "",
      hardSkills: [],
      experienceSummary: "",
    });
    expect(out).toEqual({
      name: "",
      location: "",
      currentPosition: "",
      hardSkills: [],
      experienceSummary: "",
    });
  });

  it("maps legacy title and skills to currentPosition and hardSkills", () => {
    const out = cvGeminiMetaSchema.parse({
      name: "Jane Doe",
      title: "Engineer",
      skills: ["Python", "AWS"],
      experienceSummary: "Built things.",
    });
    expect(out.name).toBe("Jane Doe");
    expect(out.currentPosition).toBe("Engineer");
    expect(out.hardSkills).toEqual(["Python", "AWS"]);
    expect(out.location).toBe("");
  });
});

describe("compatibilityBatchResponseSchema", () => {
  it("parses evaluations with cvId + scores", () => {
    const cvId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const out = compatibilityBatchResponseSchema.parse({
      evaluations: [
        {
          cvId,
          overallScore: 80,
          skillsMatch: 70,
          experienceRelevance: 85,
          educationFit: 75,
          strengths: ["a"],
          gaps: ["b"],
          summary: "Good fit.",
        },
      ],
    });
    expect(out.evaluations).toHaveLength(1);
    expect(out.evaluations[0]!.cvId).toBe(cvId);
    expect(out.evaluations[0]!.overallScore).toBe(80);
  });
});
