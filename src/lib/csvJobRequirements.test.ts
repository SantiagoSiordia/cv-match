import { describe, expect, it } from "vitest";
import {
  buildExtractedNarrativeFromRow,
  dedupeHeaderNames,
  inferSkillsFromRow,
  inferTitleGuessFromRow,
  parseJobRequirementsCsv,
  sourceRequirementIdFromRow,
} from "./csvJobRequirements";

describe("dedupeHeaderNames", () => {
  it("renames duplicate headers with a suffix", () => {
    expect(dedupeHeaderNames(["A", "B", "A", "A"])).toEqual([
      "A",
      "B",
      "A (2)",
      "A (3)",
    ]);
  });

  it("uses Column for blank headers", () => {
    expect(dedupeHeaderNames(["", " "])).toEqual(["Column", "Column (2)"]);
  });
});

describe("parseJobRequirementsCsv", () => {
  it("parses quoted commas and duplicate Skill Mapping columns", () => {
    const csv = `Name,Skill Mapping,Location,Skill Mapping
"Acme, Inc",Java||Python,NY,DevOps
Bob,Go,,Rust
`;
    const rows = parseJobRequirementsCsv(Buffer.from(csv, "utf8"));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.Name).toBe("Acme, Inc");
    expect(rows[0]!["Skill Mapping"]).toBe("Java||Python");
    expect(rows[0]!["Skill Mapping (2)"]).toBe("DevOps");
    expect(rows[1]!.Name).toBe("Bob");
  });

  it("skips rows where every cell is empty or Not Available", () => {
    const csv = `A,B
Not Available,Not Available
x,y
`;
    const rows = parseJobRequirementsCsv(Buffer.from(csv, "utf8"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.A).toBe("x");
  });
});

describe("buildExtractedNarrativeFromRow", () => {
  it("omits Not Available and sorts keys", () => {
    const text = buildExtractedNarrativeFromRow({
      Z: "last",
      A: "Not Available",
      M: "mid",
    });
    expect(text).toBe("M: mid\nZ: last");
  });
});

describe("inferTitleGuessFromRow", () => {
  it("prefers Role then Required Designation then Opportunity Name", () => {
    expect(
      inferTitleGuessFromRow({
        Role: "Lead",
        "Required Designation": "Mgr",
        "Opportunity Name": "Proj",
      }),
    ).toBe("Lead");
    expect(
      inferTitleGuessFromRow({
        Role: "Not Available",
        "Required Designation": "Mgr",
        "Opportunity Name": "Proj",
      }),
    ).toBe("Mgr");
    expect(
      inferTitleGuessFromRow({
        Role: "Not Available",
        "Opportunity Name": "Proj",
      }),
    ).toBe("Proj");
  });
});

describe("inferSkillsFromRow", () => {
  it("splits skill-like columns on delimiters", () => {
    const skills = inferSkillsFromRow({
      "Skill Mapping": "A||B, C",
      "Primary Competency Proficiency Details": "Not Available",
    });
    expect(skills).toEqual(["A", "B", "C"]);
  });
});

describe("sourceRequirementIdFromRow", () => {
  it("returns Requirement Id when set", () => {
    expect(
      sourceRequirementIdFromRow({ "Requirement Id": "10525207" }),
    ).toBe("10525207");
  });
});
