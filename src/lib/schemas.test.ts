import { describe, expect, it } from "vitest";
import { cvGeminiMetaSchema } from "@/lib/schemas";

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
