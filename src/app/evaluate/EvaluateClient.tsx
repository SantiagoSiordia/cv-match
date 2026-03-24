"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CvStoredMeta, JobStoredMeta } from "@/lib/schemas";
import type { ApiCvList, ApiErrorBody, ApiJobList } from "@/components/ApiTypes";
import type { EvaluationRun } from "@/lib/schemas";

export function EvaluateClient() {
  const [cvs, setCvs] = useState<CvStoredMeta[]>([]);
  const [jobs, setJobs] = useState<JobStoredMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [selectedCv, setSelectedCv] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<EvaluationRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, jRes] = await Promise.all([
        fetch("/api/cvs"),
        fetch("/api/job-descriptions"),
      ]);
      const cJson = (await cRes.json()) as
        | { ok: true; data: ApiCvList }
        | ApiErrorBody;
      const jJson = (await jRes.json()) as
        | { ok: true; data: ApiJobList }
        | ApiErrorBody;
      if (!cJson.ok) {
        setError(cJson.error.message);
        return;
      }
      if (!jJson.ok) {
        setError(jJson.error.message);
        return;
      }
      setCvs(cJson.data.items);
      setJobs(jJson.data.items);
    } catch {
      setError("Could not load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedIds = useMemo(
    () => Object.keys(selectedCv).filter((k) => selectedCv[k]),
    [selectedCv],
  );

  async function onRun() {
    setError(null);
    if (!jobId) {
      setError("Select a job description");
      return;
    }
    if (!selectedIds.length) {
      setError("Select at least one CV");
      return;
    }
    setRunning(true);
    setLastRun(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescriptionId: jobId, cvIds: selectedIds }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { run: EvaluationRun } }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setLastRun(json.data.run);
    } catch {
      setError("Evaluation request failed");
    } finally {
      setRunning(false);
    }
  }

  function toggleCv(id: string) {
    setSelectedCv((s) => ({ ...s, [id]: !s[id] }));
  }

  function selectAll() {
    const next: Record<string, boolean> = {};
    for (const c of cvs) next[c.id] = true;
    setSelectedCv(next);
  }

  function clearCv() {
    setSelectedCv({});
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Evaluate
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Choose one job description and one or more CVs. Each CV is scored
        independently against the role.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Job description
            </h2>
            {jobs.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                No job descriptions yet.{" "}
                <Link
                  href="/job-descriptions"
                  className="font-medium text-zinc-900 underline dark:text-zinc-100"
                >
                  Add one
                </Link>
                .
              </p>
            ) : (
              <select
                className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              >
                <option value="">Select…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {(j.titleGuess ?? j.originalName).slice(0, 80)}
                  </option>
                ))}
              </select>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                CVs
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearCv}
                  className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                >
                  Clear
                </button>
              </div>
            </div>
            {cvs.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                No CVs yet.{" "}
                <Link
                  href="/cvs"
                  className="font-medium text-zinc-900 underline dark:text-zinc-100"
                >
                  Upload PDFs
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                {cvs.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-100 px-2 py-2 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!!selectedCv[c.id]}
                        onChange={() => toggleCv(c.id)}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-zinc-900 dark:text-zinc-50">
                          {c.gemini?.name ?? c.originalName}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {c.originalName}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="mt-8">
        <button
          type="button"
          disabled={running || loading}
          onClick={() => void onRun()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {running ? "Running…" : "Run evaluation"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {lastRun ? (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            Evaluation complete
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            Run{" "}
            <code className="rounded bg-emerald-100 px-1 text-xs dark:bg-emerald-950">
              {lastRun.id.slice(0, 8)}…
            </code>{" "}
            saved.
          </p>
          <Link
            href={`/dashboard/compare/${lastRun.id}`}
            className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 dark:bg-emerald-200 dark:text-emerald-950 dark:hover:bg-white"
          >
            View comparison
          </Link>
        </div>
      ) : null}
    </div>
  );
}
