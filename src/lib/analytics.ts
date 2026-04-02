import type { CvStoredMeta, EvaluationRun, JobStoredMeta } from "@/lib/schemas";
import {
  buildJobCvMatrix,
  readCvEmbeddingIndexSnapshot,
  type JobCvMatrixRow,
} from "@/lib/embeddings";
import { listEvaluationRuns } from "@/lib/evaluationsStore";
import {
  listCvs,
  listJobDescriptions,
  readCvExtractedText,
  readJobExtractedText,
} from "@/lib/storage";

export function normalizeSkillLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function displayNameForCv(cv: CvStoredMeta): string {
  const n = cv.gemini?.name?.trim();
  if (n) return n;
  return cv.originalName.replace(/\.[^.]+$/, "") || cv.originalName;
}

function bestEmbeddingFromMatches(row: JobCvMatrixRow): {
  cvId: string;
  cvName: string;
  scorePercent: number;
} | null {
  const ok = row.matches.filter((m) => !m.skipped);
  if (ok.length === 0) return null;
  const top = ok[0]!;
  return {
    cvId: top.cvId,
    cvName: top.cvOriginalName,
    scorePercent: top.scorePercent,
  };
}

function runsByLatestPerJob(runs: EvaluationRun[]): Map<string, EvaluationRun> {
  const map = new Map<string, EvaluationRun>();
  for (const run of runs) {
    const prev = map.get(run.jobDescriptionId);
    if (
      !prev ||
      new Date(run.createdAt).getTime() > new Date(prev.createdAt).getTime()
    ) {
      map.set(run.jobDescriptionId, run);
    }
  }
  return map;
}

function bestLlmFromRun(run: EvaluationRun): {
  cvId: string;
  cvName: string;
  overallScore: number;
} | null {
  let best: { cvId: string; cvName: string; overallScore: number } | null =
    null;
  for (const r of run.results) {
    const s = r.result?.overallScore;
    if (s === undefined || s === null) continue;
    if (!best || s > best.overallScore) {
      best = {
        cvId: r.cvId,
        cvName: r.cvOriginalName,
        overallScore: s,
      };
    }
  }
  return best;
}

function countStrongEmbedding(
  row: JobCvMatrixRow,
  thresholdPercent: number,
): number {
  return row.matches.filter(
    (m) => !m.skipped && m.scorePercent >= thresholdPercent,
  ).length;
}

export type TrainingOpportunity = {
  skill: string;
  demandJobCount: number;
  candidatesMissingCount: number;
  candidatesMissing: Array<{ cvId: string; displayName: string }>;
  priorityScore: number;
};

export type AnalyticsOverview = {
  generatedAt: string;
  cvEmbeddingIndex: {
    model: string;
    updatedAt: string | null;
    entryCount: number;
  };
  counts: {
    cvs: number;
    jobs: number;
    cvsWithExtractedText: number;
    jobsWithExtractedText: number;
    evaluationRuns: number;
    evaluationRunsLast7Days: number;
  };
  thresholds: {
    embeddingPercent: number;
    llmOverall: number;
  };
  closableByEmbedding: {
    count: number;
    jobs: Array<{
      jobDescriptionId: string;
      jobTitle: string;
      bestCvId: string;
      bestCvName: string;
      bestScorePercent: number;
      candidatesAtOrAboveThreshold: number;
    }>;
  };
  closableByLlm: {
    count: number;
    jobs: Array<{
      jobDescriptionId: string;
      jobTitle: string;
      runId: string;
      runCreatedAt: string;
      bestCvId: string;
      bestCvName: string;
      bestOverallScore: number;
      candidatesAtOrAboveThreshold: number;
    }>;
  };
  jobRows: Array<{
    jobDescriptionId: string;
    jobTitle: string;
    bestEmbedding: {
      cvId: string;
      cvName: string;
      scorePercent: number;
    } | null;
    bestLlm: {
      cvId: string;
      cvName: string;
      overallScore: number;
      runId: string;
    } | null;
    top3Embedding: Array<{
      cvId: string;
      cvName: string;
      scorePercent: number;
    }>;
  }>;
  trainingOpportunities: TrainingOpportunity[];
};

function cvSkillSet(cv: CvStoredMeta): Set<string> {
  const set = new Set<string>();
  for (const s of cv.gemini?.skills ?? []) {
    const k = normalizeSkillLabel(s);
    if (k.length) set.add(k);
  }
  return set;
}

function computeTrainingOpportunities(
  jobs: JobStoredMeta[],
  cvs: CvStoredMeta[],
): TrainingOpportunity[] {
  const skillToJobs = new Map<string, Set<string>>();
  for (const job of jobs) {
    for (const s of job.geminiSkills ?? []) {
      const k = normalizeSkillLabel(s);
      if (!k.length) continue;
      let set = skillToJobs.get(k);
      if (!set) {
        set = new Set();
        skillToJobs.set(k, set);
      }
      set.add(job.id);
    }
  }

  const cvSets = cvs.map((cv) => ({ cv, skills: cvSkillSet(cv) }));
  const out: TrainingOpportunity[] = [];

  for (const [skill, jobIds] of skillToJobs) {
    const missing = cvSets
      .filter(({ skills }) => !skills.has(skill))
      .map(({ cv }) => ({
        cvId: cv.id,
        displayName: displayNameForCv(cv),
      }));
    const demandJobCount = jobIds.size;
    const candidatesMissingCount = missing.length;
    const priorityScore = demandJobCount * candidatesMissingCount;
    out.push({
      skill,
      demandJobCount,
      candidatesMissingCount,
      candidatesMissing: missing.slice(0, 50),
      priorityScore,
    });
  }

  out.sort((a, b) => b.priorityScore - a.priorityScore);
  return out.slice(0, 40);
}

export async function computeAnalyticsOverview(input: {
  thresholdEmbeddingPercent: number;
  thresholdLlmOverall: number;
}): Promise<AnalyticsOverview> {
  const [cvs, jobs, runs, matrix, cvSnap] = await Promise.all([
    listCvs(),
    listJobDescriptions(),
    listEvaluationRuns(),
    buildJobCvMatrix(),
    readCvEmbeddingIndexSnapshot(),
  ]);

  const latestByJob = runsByLatestPerJob(runs);
  const jobTitleById = new Map(
    jobs.map((j) => [
      j.id,
      j.titleGuess?.trim() ||
        j.originalName.replace(/\.[^.]+$/, "") ||
        "Job",
    ]),
  );

  const cvTexts = await Promise.all(cvs.map((cv) => readCvExtractedText(cv.id)));
  const cvsWithExtractedText = cvTexts.filter((t) => t?.trim()).length;
  const jobTexts = await Promise.all(
    jobs.map((job) => readJobExtractedText(job.id)),
  );
  const jobsWithExtractedText = jobTexts.filter((t) => t?.trim()).length;

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const evaluationRunsLast7Days = runs.filter(
    (r) => new Date(r.createdAt).getTime() >= sevenDaysAgo,
  ).length;

  const closableEmbeddingJobs: AnalyticsOverview["closableByEmbedding"]["jobs"] =
    [];
  for (const row of matrix) {
    const best = bestEmbeddingFromMatches(row);
    const nStrong = countStrongEmbedding(
      row,
      input.thresholdEmbeddingPercent,
    );
    if (nStrong > 0 && best) {
      closableEmbeddingJobs.push({
        jobDescriptionId: row.jobDescriptionId,
        jobTitle: row.jobTitle,
        bestCvId: best.cvId,
        bestCvName: best.cvName,
        bestScorePercent: best.scorePercent,
        candidatesAtOrAboveThreshold: nStrong,
      });
    }
  }

  const closableLlmJobs: AnalyticsOverview["closableByLlm"]["jobs"] = [];
  for (const [jobId, run] of latestByJob) {
    const title = jobTitleById.get(jobId) ?? "Job";
    let countAbove = 0;
    for (const r of run.results) {
      const s = r.result?.overallScore;
      if (s !== undefined && s !== null && s >= input.thresholdLlmOverall) {
        countAbove++;
      }
    }
    const best = bestLlmFromRun(run);
    if (countAbove > 0 && best) {
      closableLlmJobs.push({
        jobDescriptionId: jobId,
        jobTitle: title,
        runId: run.id,
        runCreatedAt: run.createdAt,
        bestCvId: best.cvId,
        bestCvName: best.cvName,
        bestOverallScore: best.overallScore,
        candidatesAtOrAboveThreshold: countAbove,
      });
    }
  }

  const matrixByJob = new Map(matrix.map((r) => [r.jobDescriptionId, r]));
  const jobRows: AnalyticsOverview["jobRows"] = jobs.map((job) => {
    const row = matrixByJob.get(job.id);
    const title =
      job.titleGuess?.trim() ||
      job.originalName.replace(/\.[^.]+$/, "") ||
      "Job";
    const bestEmb = row ? bestEmbeddingFromMatches(row) : null;
    const latest = latestByJob.get(job.id);
    const bestL = latest ? bestLlmFromRun(latest) : null;
    const top3 =
      row?.matches
        .filter((m) => !m.skipped)
        .slice(0, 3)
        .map((m) => ({
          cvId: m.cvId,
          cvName: m.cvOriginalName,
          scorePercent: m.scorePercent,
        })) ?? [];
    return {
      jobDescriptionId: job.id,
      jobTitle: title,
      bestEmbedding: bestEmb
        ? {
            cvId: bestEmb.cvId,
            cvName: bestEmb.cvName,
            scorePercent: bestEmb.scorePercent,
          }
        : null,
      bestLlm: bestL && latest
        ? {
            cvId: bestL.cvId,
            cvName: bestL.cvName,
            overallScore: bestL.overallScore,
            runId: latest.id,
          }
        : null,
      top3Embedding: top3,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    cvEmbeddingIndex: {
      model: cvSnap.model,
      updatedAt: cvSnap.updatedAt ?? null,
      entryCount: cvSnap.entryCount,
    },
    counts: {
      cvs: cvs.length,
      jobs: jobs.length,
      cvsWithExtractedText,
      jobsWithExtractedText,
      evaluationRuns: runs.length,
      evaluationRunsLast7Days,
    },
    thresholds: {
      embeddingPercent: input.thresholdEmbeddingPercent,
      llmOverall: input.thresholdLlmOverall,
    },
    closableByEmbedding: {
      count: closableEmbeddingJobs.length,
      jobs: closableEmbeddingJobs.sort(
        (a, b) => b.bestScorePercent - a.bestScorePercent,
      ),
    },
    closableByLlm: {
      count: closableLlmJobs.length,
      jobs: closableLlmJobs.sort(
        (a, b) => b.bestOverallScore - a.bestOverallScore,
      ),
    },
    jobRows,
    trainingOpportunities: computeTrainingOpportunities(jobs, cvs),
  };
}
