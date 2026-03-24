import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { evaluationsDir } from "@/lib/paths";
import { initStorageDirs } from "@/lib/storage";
import { evaluationRunSchema, type EvaluationRun } from "@/lib/schemas";

export async function saveEvaluationRun(
  run: Omit<EvaluationRun, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<EvaluationRun> {
  await initStorageDirs();
  const id = run.id ?? randomUUID();
  const createdAt = run.createdAt ?? new Date().toISOString();
  const full: EvaluationRun = {
    id,
    createdAt,
    jobDescriptionId: run.jobDescriptionId,
    jobTitle: run.jobTitle ?? null,
    results: run.results,
  };
  evaluationRunSchema.parse(full);
  const filePath = path.join(evaluationsDir(), `${id}.json`);
  await writeFile(filePath, JSON.stringify(full, null, 2), "utf8");
  return full;
}

export async function getEvaluationRun(id: string): Promise<EvaluationRun | null> {
  await initStorageDirs();
  try {
    const raw = await readFile(
      path.join(evaluationsDir(), `${id}.json`),
      "utf8",
    );
    const parsed = JSON.parse(raw) as unknown;
    return evaluationRunSchema.parse(parsed);
  } catch {
    return null;
  }
}

export async function listEvaluationRuns(
  jobDescriptionId?: string,
): Promise<EvaluationRun[]> {
  await initStorageDirs();
  const names = await readdir(evaluationsDir());
  const runs: EvaluationRun[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(evaluationsDir(), name), "utf8");
      const parsed = evaluationRunSchema.parse(JSON.parse(raw) as unknown);
      if (
        jobDescriptionId &&
        parsed.jobDescriptionId !== jobDescriptionId
      ) {
        continue;
      }
      runs.push(parsed);
    } catch {
      /* skip invalid */
    }
  }
  runs.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return runs;
}
