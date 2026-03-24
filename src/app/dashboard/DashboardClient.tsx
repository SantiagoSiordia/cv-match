"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EvaluationRun, JobStoredMeta } from "@/lib/schemas";
import type { ApiErrorBody, ApiEvaluationsList, ApiJobList } from "@/components/ApiTypes";

type SortKey = "createdAt" | "bestScore";

export function DashboardClient() {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [jobs, setJobs] = useState<JobStoredMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("createdAt");

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/job-descriptions");
      const json = (await res.json()) as
        | { ok: true; data: ApiJobList }
        | ApiErrorBody;
      if (json.ok) setJobs(json.data.items);
    } catch {
      /* optional */
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = jobFilter
      ? `?jobDescriptionId=${encodeURIComponent(jobFilter)}`
      : "";
    try {
      const res = await fetch(`/api/evaluations${q}`);
      const json = (await res.json()) as
        | { ok: true; data: ApiEvaluationsList }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setRuns(json.data.runs);
    } catch {
      setError("Could not load evaluations");
    } finally {
      setLoading(false);
    }
  }, [jobFilter]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const sortedRuns = useMemo(() => {
    const copy = [...runs];
    if (sort === "createdAt") {
      copy.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return copy;
    }
    copy.sort((a, b) => bestScore(b) - bestScore(a));
    return copy;
  }, [runs, sort]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Results
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Past evaluation runs are stored as JSON under{" "}
        <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
          evaluations/
        </code>
        . Filter by job or sort by best candidate score.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Job description
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {(j.titleGuess ?? j.originalName).slice(0, 80)}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-56">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Sort
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="createdAt">Newest run first</option>
            <option value="bestScore">Highest best score</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void loadRuns()}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Loading…</p>
        ) : sortedRuns.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            No runs yet.{" "}
            <Link href="/evaluate" className="font-medium underline">
              Run an evaluation
            </Link>
            .
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">CVs</th>
                <th className="px-4 py-3">Best score</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sortedRuns.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-zinc-800 dark:text-zinc-200">
                    {r.jobTitle ?? r.jobDescriptionId}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {r.results.length}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {bestScore(r)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/compare/${r.id}`}
                      className="font-medium text-zinc-900 underline dark:text-zinc-100"
                    >
                      Compare
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function bestScore(run: EvaluationRun): number {
  let max = 0;
  for (const row of run.results) {
    const s = row.result?.overallScore;
    if (typeof s === "number" && s > max) max = s;
  }
  return max;
}
