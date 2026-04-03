import { describe, expect, it } from "vitest";
import { compareCvMatchRowsForRanking } from "@/lib/embeddings";
import type { CvMatchRow } from "@/lib/embeddings";
import {
  applyTechnicalJobMatchOrdering,
  cvHasTechnicalEvidence,
  cvIsClearlyNonTechnical,
  extractedResumeTextLooksTechnical,
  jobRequiresTechnicalCandidates,
} from "@/lib/technicalRoleRanking";
import type { CvStoredMeta, JobStoredMeta } from "@/lib/schemas";

const JOB_SA = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
const CV_SM = "11111111-1111-4111-8111-111111111111";
const CV_PY = "22222222-2222-4222-8222-222222222222";

function job(partial: Partial<JobStoredMeta> & Pick<JobStoredMeta, "id">): JobStoredMeta {
  return {
    originalName: "Solutions Architect.pdf",
    uploadedAt: "2020-01-01T00:00:00.000Z",
    type: "job_description",
    storageFileName: "x",
    mimeType: "application/pdf",
    extractedCharCount: 100,
    ...partial,
  } as JobStoredMeta;
}

function cv(partial: Partial<CvStoredMeta> & Pick<CvStoredMeta, "id">): CvStoredMeta {
  return {
    originalName: "resume.pdf",
    uploadedAt: "2020-01-01T00:00:00.000Z",
    type: "cv",
    storageFileName: "y",
    extractedCharCount: 100,
    ...partial,
  } as CvStoredMeta;
}

function row(
  id: string,
  name: string,
  pct: number,
  cos: number,
): CvMatchRow {
  return {
    cvId: id,
    cvOriginalName: name,
    scorePercent: pct,
    cosineSimilarity: cos,
  };
}

describe("jobRequiresTechnicalCandidates", () => {
  it("is true for solutions architect title", () => {
    const j = job({
      id: JOB_SA,
      titleGuess: "Solutions Architect",
      geminiSkills: [],
    });
    expect(jobRequiresTechnicalCandidates(j, "Solutions Architect")).toBe(true);
  });

  it("is false for generic PM title without tech skills", () => {
    const j = job({
      id: JOB_SA,
      originalName: "role.pdf",
      titleGuess: "Program Manager",
      geminiSkills: ["Stakeholder management"],
    });
    expect(jobRequiresTechnicalCandidates(j, "Program Manager")).toBe(false);
  });
});

describe("cvIsClearlyNonTechnical", () => {
  it("detects scrum master without tech skills", () => {
    const c = cv({
      id: CV_SM,
      originalName: "Scrum master 1.pdf",
      gemini: {
        name: "",
        location: "",
        currentPosition: "Scrum Master",
        hardSkills: ["Jira", "Agile"],
        experienceSummary: "",
      },
    });
    expect(cvHasTechnicalEvidence(c)).toBe(false);
    expect(cvIsClearlyNonTechnical(c)).toBe(true);
  });

  it("does not demote scrum master with python", () => {
    const c = cv({
      id: CV_SM,
      gemini: {
        name: "",
        location: "",
        currentPosition: "Scrum Master",
        hardSkills: ["Python", "AWS"],
        experienceSummary: "",
      },
    });
    expect(cvHasTechnicalEvidence(c)).toBe(true);
    expect(cvIsClearlyNonTechnical(c)).toBe(false);
  });

  it("treats scrum-master filename as non-tech even when Gemini title is generic", () => {
    const c = cv({
      id: CV_SM,
      originalName: "Scrum master 1.pdf",
      gemini: {
        name: "",
        location: "",
        currentPosition: "Consultant",
        hardSkills: [],
        experienceSummary: "",
      },
    });
    expect(cvIsClearlyNonTechnical(c, undefined)).toBe(true);
  });
});

describe("extractedResumeTextLooksTechnical", () => {
  it("is true for common stack keywords", () => {
    expect(
      extractedResumeTextLooksTechnical(
        "Senior engineer — Python, AWS, Kubernetes, PostgreSQL.",
      ),
    ).toBe(true);
  });

  it("is false for agile-only prose", () => {
    expect(
      extractedResumeTextLooksTechnical(
        "Scrum Master facilitating sprint planning, retrospectives, and stakeholder alignment.",
      ),
    ).toBe(false);
  });
});

describe("applyTechnicalJobMatchOrdering", () => {
  it("places technical CVs above clearly non-technical when job is technical", () => {
    const j = job({
      id: JOB_SA,
      titleGuess: "Solutions Architect",
      geminiSkills: ["AWS", "Microservices"],
    });
    const sm = cv({
      id: CV_SM,
      originalName: "Scrum master 1.pdf",
      gemini: {
        name: "",
        location: "",
        currentPosition: "Scrum Master",
        hardSkills: [],
        experienceSummary: "",
      },
    });
    const py = cv({
      id: CV_PY,
      originalName: "python_engineer.pdf",
      gemini: {
        name: "",
        location: "",
        currentPosition: "Software Engineer",
        hardSkills: ["Python"],
        experienceSummary: "",
      },
    });
    const matches = [row(CV_SM, sm.originalName, 90, 0.9), row(CV_PY, py.originalName, 60, 0.6)];
    matches.sort(compareCvMatchRowsForRanking);
    expect(matches[0]!.cvId).toBe(CV_SM);

    const cvById = new Map<string, CvStoredMeta>([
      [CV_SM, sm],
      [CV_PY, py],
    ]);
    const out = applyTechnicalJobMatchOrdering(
      j,
      "Solutions Architect",
      matches,
      cvById,
      compareCvMatchRowsForRanking,
    );
    expect(out[0]!.cvId).toBe(CV_PY);
    expect(out[1]!.cvId).toBe(CV_SM);
  });

  it("uses résumé text when Gemini metadata has no technical fields", () => {
    const j = job({
      id: JOB_SA,
      titleGuess: "Solutions Architect",
    });
    const sm = cv({
      id: CV_SM,
      originalName: "Scrum master 1.pdf",
      gemini: {
        name: "",
        location: "",
        currentPosition: "Scrum Master",
        hardSkills: [],
        experienceSummary: "",
      },
    });
    const py = cv({
      id: CV_PY,
      originalName: "engineer.pdf",
      gemini: {
        name: "",
        location: "",
        currentPosition: "",
        hardSkills: [],
        experienceSummary: "",
      },
    });
    const matches = [row(CV_SM, sm.originalName, 88, 0.88), row(CV_PY, py.originalName, 55, 0.55)];
    matches.sort(compareCvMatchRowsForRanking);
    const cvById = new Map<string, CvStoredMeta>([
      [CV_SM, sm],
      [CV_PY, py],
    ]);
    const cvTextById = new Map<string, string>([
      [
        CV_SM,
        "Scrum Master — sprint planning, agile coaching, Jira, stakeholder management.",
      ],
      [
        CV_PY,
        "Software engineer building APIs in Python on AWS with Docker and PostgreSQL.",
      ],
    ]);
    const out = applyTechnicalJobMatchOrdering(
      j,
      "Solutions Architect",
      matches,
      cvById,
      compareCvMatchRowsForRanking,
      cvTextById,
    );
    expect(out[0]!.cvId).toBe(CV_PY);
    expect(out[1]!.cvId).toBe(CV_SM);
  });

  it("does nothing when no technical CV exists", () => {
    const j = job({
      id: JOB_SA,
      titleGuess: "Solutions Architect",
    });
    const sm = cv({
      id: CV_SM,
      gemini: {
        name: "",
        location: "",
        currentPosition: "Scrum Master",
        hardSkills: [],
        experienceSummary: "",
      },
    });
    const ba = cv({
      id: CV_PY,
      originalName: "ba.pdf",
      gemini: {
        name: "",
        location: "",
        currentPosition: "Business Analyst",
        hardSkills: [],
        experienceSummary: "",
      },
    });
    const matches = [row(CV_SM, "a.pdf", 80, 0.8), row(CV_PY, "b.pdf", 70, 0.7)];
    matches.sort(compareCvMatchRowsForRanking);
    const cvById = new Map<string, CvStoredMeta>([
      [CV_SM, sm],
      [CV_PY, ba],
    ]);
    const out = applyTechnicalJobMatchOrdering(
      j,
      "Solutions Architect",
      matches,
      cvById,
      compareCvMatchRowsForRanking,
    );
    expect(out.map((r) => r.cvId)).toEqual([CV_SM, CV_PY]);
  });
});
