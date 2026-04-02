"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AnalyticsOverview } from "@/lib/analytics";
import type { ApiErrorBody, BulkEvaluateStreamEvent } from "@/components/ApiTypes";
import { PreviewModal } from "@/components/PreviewModal";

/** Stable min width so table columns don’t jump between loading and loaded. */
const JOBS_TABLE_MIN_WIDTH = "56rem";

function BulkSpinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin motion-reduce:animate-none ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function BulkCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

type BulkJobProgressRow = {
  jobDescriptionId: string;
  jobTitle: string;
  state: "pending" | "running" | "skipped" | "done" | "error";
  reason?: string;
  cvCount?: number;
  runId?: string;
};

type BulkProgressState =
  | { phase: "matrix" }
  | { phase: "jobs"; total: number; jobs: BulkJobProgressRow[] };

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildJobRowsCsv(overview: AnalyticsOverview): string {
  const headers = [
    "job_id",
    "job_title",
    "best_embed_cv_id",
    "best_embed_score",
    "best_llm_cv_id",
    "best_llm_score",
    "llm_run_id",
    "top3_embed",
  ];
  const lines = [headers.join(",")];
  for (const row of overview.jobRows) {
    const top3 = row.top3Embedding
      .map((t) => `${t.cvName}:${t.scorePercent}`)
      .join(" | ");
    lines.push(
      [
        row.jobDescriptionId,
        escapeCsvCell(row.jobTitle),
        row.bestEmbedding?.cvId ?? "",
        row.bestEmbedding != null ? String(row.bestEmbedding.scorePercent) : "",
        row.bestLlm?.cvId ?? "",
        row.bestLlm != null ? String(row.bestLlm.overallScore) : "",
        row.bestLlm?.runId ?? "",
        escapeCsvCell(top3),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="h-3 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-3 h-9 w-20 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-full max-w-[180px] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

function JobsTableSkeleton() {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table
        className="w-full table-fixed text-left text-sm"
        style={{ minWidth: JOBS_TABLE_MIN_WIDTH }}
      >
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          <tr>
            <th className="w-[19%] px-3 py-2">Job</th>
            <th className="w-[17%] px-3 py-2">Best match</th>
            <th className="w-[6%] px-3 py-2">%</th>
            <th className="w-[28%] px-3 py-2">Top 3</th>
            <th className="w-[17%] px-3 py-2">LLM best</th>
            <th className="w-[13%] px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {Array.from({ length: 10 }, (_, i) => (
            <tr key={i}>
              <td className="px-3 py-3">
                <div className="h-4 w-[85%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="h-4 w-[70%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="h-4 w-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="h-4 w-[90%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="h-4 w-[65%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrainingTableSkeleton() {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table
        className="w-full table-fixed text-left text-sm"
        style={{ minWidth: "42rem" }}
      >
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          <tr>
            <th className="w-[22%] px-3 py-2">Skill</th>
            <th className="w-[12%] px-3 py-2">Jobs</th>
            <th className="w-[14%] px-3 py-2">CVs missing</th>
            <th className="w-[52%] px-3 py-2">Sample candidates</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, i) => (
            <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="px-3 py-3">
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="h-4 w-6 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="h-4 w-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
              <td className="px-3 py-3">
                <div className="h-4 w-[80%] animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsClient() {
  /** Default 55: many embedding pairs fall below 70%; see closable hint under KPIs. */
  const [embThreshold, setEmbThreshold] = useState(55);
  const [llmThreshold, setLlmThreshold] = useState(75);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [bulkK, setBulkK] = useState(5);
  const [bulkFloor, setBulkFloor] = useState(0);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgressState | null>(
    null,
  );
  const [pdfPreview, setPdfPreview] = useState<{
    cvId: string;
    title: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        embeddingThreshold: String(embThreshold),
        llmThreshold: String(llmThreshold),
      });
      const res = await fetch(`/api/analytics/overview?${q}`);
      const json = (await res.json()) as
        | { ok: true; data: { overview: AnalyticsOverview } }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        setOverview(null);
        return;
      }
      setOverview(json.data.overview);
    } catch {
      setError("Could not load analytics");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [embThreshold, llmThreshold]);

  useEffect(() => {
    void load();
  }, [load]);

  const csvBlobUrl = useMemo(() => {
    if (!overview) return null;
    const csv = buildJobRowsCsv(overview);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [overview]);

  useEffect(() => {
    if (!csvBlobUrl) return;
    return () => URL.revokeObjectURL(csvBlobUrl);
  }, [csvBlobUrl]);

  const initialLoad = loading && !overview;
  const refreshing = loading && !!overview;

  const maxBestEmbeddingPercent = useMemo(() => {
    if (!overview) return null;
    let max = -1;
    for (const r of overview.jobRows) {
      const s = r.bestEmbedding?.scorePercent;
      if (s !== undefined && s > max) max = s;
    }
    return max >= 0 ? max : null;
  }, [overview]);

  const bulkProgressStats = useMemo(() => {
    if (!bulkProgress || bulkProgress.phase === "matrix") return null;
    const { total, jobs } = bulkProgress;
    const finished = jobs.filter(
      (j) =>
        j.state === "done" ||
        j.state === "skipped" ||
        j.state === "error",
    ).length;
    const pct = total ? Math.round((finished / total) * 100) : 0;
    return { total, finished, pct, running: jobs.some((j) => j.state === "running") };
  }, [bulkProgress]);

  async function onRebuildIndices() {
    setActionMsg(null);
    setRebuilding(true);
    try {
      const res = await fetch("/api/analytics/rebuild-indices", {
        method: "POST",
      });
      const json = (await res.json()) as ApiErrorBody | { ok: true };
      if (!json.ok) {
        setActionMsg(json.error.message);
        return;
      }
      setActionMsg("Embedding indices rebuilt.");
      await load();
    } catch {
      setActionMsg("Rebuild failed.");
    } finally {
      setRebuilding(false);
    }
  }

  async function onBackfillSkills() {
    setActionMsg(null);
    setBackfilling(true);
    try {
      const res = await fetch("/api/analytics/backfill-job-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as
        | ApiErrorBody
        | { ok: true; data: { processed: number } };
      if (!json.ok) {
        setActionMsg(json.error.message);
        return;
      }
      setActionMsg(`Skill backfill finished (${json.data.processed} job(s)).`);
      await load();
    } catch {
      setActionMsg("Backfill failed.");
    } finally {
      setBackfilling(false);
    }
  }

  async function onBulkEvaluate() {
    setActionMsg(null);
    setBulkProgress({ phase: "matrix" });
    setBulkRunning(true);
    try {
      const res = await fetch("/api/analytics/bulk-evaluate-top-k/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          k: bulkK,
          embeddingFloorPercent: bulkFloor,
        }),
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const json = (await res.json()) as ApiErrorBody;
          if (json.ok === false) message = json.error.message;
        } catch {
          /* keep default */
        }
        setBulkProgress(null);
        setActionMsg(message);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setBulkProgress(null);
        setActionMsg("No response body");
        return;
      }

      const dec = new TextDecoder();
      let buf = "";

      const applyEvent = (msg: BulkEvaluateStreamEvent) => {
        if (msg.type === "matrix") {
          setBulkProgress({ phase: "matrix" });
        } else if (msg.type === "ready") {
          setBulkProgress({
            phase: "jobs",
            total: msg.total,
            jobs: msg.jobs.map((j) => ({
              jobDescriptionId: j.jobDescriptionId,
              jobTitle: j.jobTitle,
              state: "pending",
            })),
          });
        } else if (msg.type === "job") {
          setBulkProgress((prev) => {
            if (!prev || prev.phase !== "jobs") return prev;
            const jobs = [...prev.jobs];
            const row = jobs[msg.index];
            if (!row) return prev;
            jobs[msg.index] = {
              ...row,
              state: msg.status,
              reason: msg.reason,
              runId: msg.runId,
              cvCount: msg.cvCount,
            };
            return { ...prev, jobs };
          });
        } else if (msg.type === "complete") {
          setBulkProgress(null);
          setActionMsg(
            `Bulk LLM: ${msg.runs.length} run(s) saved; ${msg.skipped.length} skipped.`,
          );
          void load();
        } else if (msg.type === "fatal") {
          setActionMsg(msg.message);
          setBulkProgress((prev) => {
            if (!prev || prev.phase !== "jobs") return prev;
            return {
              ...prev,
              jobs: prev.jobs.map((row) =>
                row.state === "running"
                  ? { ...row, state: "error", reason: msg.message }
                  : row,
              ),
            };
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            applyEvent(JSON.parse(t) as BulkEvaluateStreamEvent);
          } catch {
            setActionMsg("Invalid progress data from server");
            setBulkProgress(null);
            return;
          }
        }
        if (done) break;
      }
      const tail = buf.trim();
      if (tail) {
        try {
          applyEvent(JSON.parse(tail) as BulkEvaluateStreamEvent);
        } catch {
          setActionMsg("Invalid progress data from server");
          setBulkProgress(null);
        }
      }
    } catch {
      setActionMsg("Bulk evaluate failed.");
      setBulkProgress(null);
    } finally {
      setBulkRunning(false);
    }
  }

  function openCvPdf(cvId: string, displayName: string) {
    setPdfPreview({ cvId, title: displayName });
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Manager analytics
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            Embedding similarity across every job and CV (cached under{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
              embeddings/
            </code>
            ). Tune thresholds for “closable” counts; use bulk LLM to score the
            top matches per job. Job skill extraction powers training cohort
            suggestions.
          </p>
        </div>
        {refreshing ? (
          <div
            className="flex shrink-0 items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block size-3.5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent dark:border-blue-500"
              aria-hidden
            />
            Updating…
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex min-h-[2.75rem] flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Embedding closable ≥ (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={embThreshold}
            onChange={(e) => setEmbThreshold(Number(e.target.value))}
            className="mt-1 block w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            LLM closable ≥ (score)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={llmThreshold}
            onChange={(e) => setLlmThreshold(Number(e.target.value))}
            className="mt-1 block w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Refresh
        </button>
        {csvBlobUrl && overview ? (
          <a
            href={csvBlobUrl}
            download={`analytics-jobs-${overview.generatedAt.slice(0, 10)}.csv`}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Download CSV
          </a>
        ) : (
          <span
            className="inline-flex h-[38px] w-[124px] shrink-0 items-center justify-center rounded-lg border border-transparent text-sm text-transparent"
            aria-hidden
          >
            Download CSV
          </span>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Actions
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={rebuilding}
            onClick={() => void onRebuildIndices()}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {rebuilding ? "Rebuilding…" : "Rebuild embedding indices"}
          </button>
          <button
            type="button"
            disabled={backfilling}
            onClick={() => void onBackfillSkills()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-600"
          >
            {backfilling ? "Backfilling…" : "Backfill job skills (LLM)"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Top K per job
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={bulkK}
              disabled={bulkRunning}
              onChange={(e) => setBulkK(Number(e.target.value))}
              className="mt-1 block w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Embedding floor %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={bulkFloor}
              disabled={bulkRunning}
              onChange={(e) => setBulkFloor(Number(e.target.value))}
              className="mt-1 block w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
            />
          </div>
          <button
            type="button"
            disabled={bulkRunning}
            onClick={() => void onBulkEvaluate()}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          >
            {bulkRunning ? "Running…" : "Bulk LLM evaluate top K"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Bulk LLM runs one saved evaluation per job (same as Evaluate). Large
          batches can take minutes and incur model cost.
        </p>

        {bulkProgress ? (
          <div
            className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/25"
            role="region"
            aria-label="Bulk evaluation progress"
            aria-busy={bulkRunning}
          >
            {bulkProgress.phase === "matrix" ? (
              <>
                <div className="flex items-center gap-2 text-sm font-medium text-amber-950 dark:text-amber-100">
                  <BulkSpinner className="size-4 text-amber-800 dark:text-amber-200" />
                  Building embedding matrix…
                </div>
                <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                  Comparing every job to every résumé. First run can take a
                  while.
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-900/40">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-700 dark:bg-amber-400 motion-reduce:animate-none" />
                </div>
              </>
            ) : bulkProgressStats ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                    Bulk LLM progress
                  </p>
                  <p className="text-xs font-medium tabular-nums text-amber-900/90 dark:text-amber-200/90">
                    {bulkProgressStats.finished} / {bulkProgressStats.total} jobs
                    {bulkProgressStats.running ? " · scoring…" : ""}
                  </p>
                </div>
                <div
                  className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/50"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={bulkProgressStats.pct}
                >
                  <div
                    className="h-full rounded-full bg-amber-800 transition-[width] duration-300 ease-out motion-reduce:transition-none dark:bg-amber-300"
                    style={{ width: `${bulkProgressStats.pct}%` }}
                  />
                </div>
                <ul className="mt-3 max-h-52 space-y-1.5 overflow-y-auto overscroll-contain pr-1 text-sm">
                  {bulkProgress.jobs.map((row, i) => (
                    <li
                      key={`${row.jobDescriptionId}-${i}`}
                      className="flex items-start gap-2 rounded-lg py-0.5"
                    >
                      <span className="mt-0.5 shrink-0 text-amber-900/70 dark:text-amber-200/70">
                        {row.state === "pending" ? (
                          <span
                            className="block size-4 rounded-full border-2 border-amber-300 dark:border-amber-700"
                            aria-hidden
                          />
                        ) : row.state === "running" ? (
                          <BulkSpinner className="size-4" />
                        ) : row.state === "done" ? (
                          <BulkCheckIcon className="size-4 text-emerald-700 dark:text-emerald-400" />
                        ) : (
                          <span
                            className="flex size-4 items-center justify-center text-base font-bold leading-none text-amber-900 dark:text-amber-200"
                            aria-hidden
                          >
                            ×
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-medium text-amber-950 dark:text-amber-50">
                          {row.jobTitle}
                        </span>
                        {row.state === "running" && row.cvCount != null ? (
                          <span className="block text-xs text-amber-900/75 dark:text-amber-200/75">
                            Scoring {row.cvCount} CV
                            {row.cvCount === 1 ? "" : "s"}…
                          </span>
                        ) : null}
                        {row.state === "skipped" && row.reason ? (
                          <span className="block text-xs text-amber-900/70 dark:text-amber-300/80">
                            Skipped — {row.reason.replace(/_/g, " ")}
                          </span>
                        ) : null}
                        {row.state === "error" && row.reason ? (
                          <span className="block text-xs text-red-800 dark:text-red-300">
                            {row.reason}
                          </span>
                        ) : null}
                        {row.state === "done" && row.runId ? (
                          <Link
                            href={`/dashboard/compare/${row.runId}`}
                            className="mt-0.5 inline-block text-xs font-medium text-amber-900 underline decoration-amber-600/60 underline-offset-2 hover:decoration-amber-800 dark:text-amber-200 dark:decoration-amber-500/50"
                          >
                            View comparison
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
        {actionMsg ? (
          <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
            {actionMsg}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {initialLoad ? (
        <>
          <div
            className="mt-8 grid min-h-[7.5rem] gap-3 sm:grid-cols-2 lg:grid-cols-4"
            aria-busy="true"
            aria-label="Loading summary"
          >
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <section className="mt-10">
            <div className="h-6 w-72 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <JobsTableSkeleton />
          </section>
          <section className="mt-10">
            <div className="h-6 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-3 grid min-h-[8rem] gap-4 lg:grid-cols-2">
              <div className="h-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            </div>
          </section>
          <section className="mt-10">
            <div className="h-6 w-96 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="mt-2 h-4 w-full max-w-lg animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <TrainingTableSkeleton />
          </section>
        </>
      ) : null}

      {!initialLoad && overview ? (
        <>
          <div
            className={`relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${refreshing ? "opacity-70" : ""} transition-opacity`}
            aria-busy={refreshing}
          >
            <StatCard
              label="CVs / jobs"
              value={`${overview.counts.cvs} / ${overview.counts.jobs}`}
              hint={`${overview.counts.cvsWithExtractedText} CVs · ${overview.counts.jobsWithExtractedText} jobs with text`}
            />
            <StatCard
              label="Closable (embedding)"
              value={String(overview.closableByEmbedding.count)}
              hint={`≥ ${overview.thresholds.embeddingPercent}% similarity`}
            />
            <StatCard
              label="Closable (latest LLM)"
              value={String(overview.closableByLlm.count)}
              hint={`≥ ${overview.thresholds.llmOverall} on last run per job`}
            />
            <StatCard
              label="Eval runs (7d)"
              value={String(overview.counts.evaluationRunsLast7Days)}
              hint={`${overview.counts.evaluationRuns} total · CV index ${overview.cvEmbeddingIndex.entryCount} vectors`}
            />
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            Index model key: {overview.cvEmbeddingIndex.model}
            {overview.cvEmbeddingIndex.updatedAt
              ? ` · updated ${overview.cvEmbeddingIndex.updatedAt}`
              : ""}
          </p>

          {overview.counts.jobs > 0 &&
          overview.counts.cvs > 0 &&
          (overview.closableByEmbedding.count === 0 ||
            overview.closableByLlm.count === 0) ? (
            <div className="mt-3 max-w-3xl rounded-xl border border-zinc-200 bg-zinc-50/90 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                Why “closable” can be 0
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-600 dark:text-zinc-400">
                {overview.closableByEmbedding.count === 0 ? (
                  <li>
                    <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                      Embedding ({overview.thresholds.embeddingPercent}%):
                    </strong>{" "}
                    A job counts only if at least one résumé is at or above that
                    similarity. Typical scores are often in the 45–65% range, so{" "}
                    <strong className="font-medium">70%</strong> often yields 0
                    even when matches look reasonable — try lowering the number
                    above and refresh.
                    {maxBestEmbeddingPercent !== null ? (
                      <>
                        {" "}
                        Right now your strongest job–CV match in this table is{" "}
                        <strong className="tabular-nums">
                          {maxBestEmbeddingPercent}%
                        </strong>
                        .
                      </>
                    ) : (
                      <>
                        {" "}
                        If every % is blank or “—”, rebuild embedding indices or
                        confirm CVs and jobs have extractable text.
                      </>
                    )}
                  </li>
                ) : null}
                {overview.closableByLlm.count === 0 ? (
                  <li>
                    <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                      Latest LLM ({overview.thresholds.llmOverall}):
                    </strong>{" "}
                    Uses only the most recent evaluation run per job. Run{" "}
                    <Link
                      href="/evaluate"
                      className="font-medium underline"
                    >
                      Evaluate
                    </Link>{" "}
                    or bulk LLM first, or lower the LLM threshold if scores are
                    close (e.g. 72 vs 75).
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Jobs and best candidates (embedding)
            </h2>
            <div className="relative mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              {refreshing ? (
                <div
                  className="pointer-events-none absolute inset-0 z-[1] bg-zinc-100/35 dark:bg-zinc-950/35"
                  aria-hidden
                />
              ) : null}
              <table
                className="relative z-0 w-full table-fixed text-left text-sm"
                style={{ minWidth: JOBS_TABLE_MIN_WIDTH }}
              >
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <tr>
                    <th className="w-[19%] px-3 py-2">Job</th>
                    <th className="w-[17%] px-3 py-2">Best match</th>
                    <th className="w-[6%] px-3 py-2">%</th>
                    <th className="w-[28%] px-3 py-2">Top 3</th>
                    <th className="w-[17%] px-3 py-2">LLM best</th>
                    <th className="w-[13%] px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {overview.jobRows.map((row) => (
                    <tr
                      key={row.jobDescriptionId}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                    >
                      <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                        <span className="line-clamp-2 break-words">
                          {row.jobTitle}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                        {row.bestEmbedding ? (
                          <button
                            type="button"
                            onClick={() =>
                              openCvPdf(
                                row.bestEmbedding!.cvId,
                                row.bestEmbedding!.cvName,
                              )
                            }
                            className="max-w-full cursor-pointer truncate text-left font-medium text-zinc-900 underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-700 dark:text-zinc-100 dark:decoration-zinc-500 dark:hover:decoration-zinc-300"
                            title="View PDF"
                            aria-label={`View PDF for ${row.bestEmbedding.cvName}`}
                          >
                            {row.bestEmbedding.cvName}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {row.bestEmbedding != null
                          ? row.bestEmbedding.scorePercent
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {row.top3Embedding.length ? (
                          <span className="flex flex-wrap gap-x-1 gap-y-1">
                            {row.top3Embedding.map((t, i) => (
                              <span key={t.cvId} className="inline">
                                {i > 0 ? (
                                  <span className="text-zinc-400">, </span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => openCvPdf(t.cvId, t.cvName)}
                                  className="cursor-pointer text-left font-medium text-zinc-800 underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-200 dark:decoration-zinc-500 dark:hover:decoration-zinc-300"
                                  title="View PDF"
                                  aria-label={`View PDF for ${t.cvName}`}
                                >
                                  {t.cvName}{" "}
                                  <span className="font-normal text-zinc-500 dark:text-zinc-500">
                                    ({t.scorePercent})
                                  </span>
                                </button>
                              </span>
                            ))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {row.bestLlm ? (
                          <span>
                            {row.bestLlm.cvName}{" "}
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              ({row.bestLlm.overallScore})
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Link
                          href={`/evaluate?jobDescriptionId=${row.jobDescriptionId}`}
                          className="font-medium text-zinc-900 underline dark:text-zinc-100"
                        >
                          Evaluate
                        </Link>
                        {row.bestLlm ? (
                          <>
                            {" · "}
                            <Link
                              href={`/dashboard/compare/${row.bestLlm.runId}`}
                              className="font-medium text-zinc-900 underline dark:text-zinc-100"
                            >
                              Compare
                            </Link>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
            <ClosableEmbeddingPanel
              jobs={overview.closableByEmbedding.jobs}
              thresholdPercent={overview.thresholds.embeddingPercent}
              onOpenPdf={openCvPdf}
            />
            <ClosableLlmPanel
              jobs={overview.closableByLlm.jobs}
              thresholdScore={overview.thresholds.llmOverall}
            />
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Training cohorts (high demand, missing in CVs)
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Uses LLM-extracted job skills vs. CV skill lists. Run backfill if
              jobs lack skills.
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <table
                className="w-full table-fixed text-left text-sm"
                style={{ minWidth: "42rem" }}
              >
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <tr>
                    <th className="w-[22%] px-3 py-2">Skill</th>
                    <th className="w-[12%] px-3 py-2">Jobs</th>
                    <th className="w-[14%] px-3 py-2">CVs missing</th>
                    <th className="w-[52%] px-3 py-2">Sample candidates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {overview.trainingOpportunities.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-zinc-500">
                        No skill gaps found. Add jobs with extracted skills or
                        improve CV metadata.
                      </td>
                    </tr>
                  ) : (
                    overview.trainingOpportunities.map((t) => (
                      <tr key={t.skill}>
                        <td className="px-3 py-2 font-medium capitalize">
                          {t.skill}
                        </td>
                        <td className="px-3 py-2">{t.demandJobCount}</td>
                        <td className="px-3 py-2">{t.candidatesMissingCount}</td>
                        <td className="max-w-md px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {t.candidatesMissing
                            .slice(0, 8)
                            .map((c) => c.displayName)
                            .join(", ")}
                          {t.candidatesMissingCount > 8
                            ? ` +${t.candidatesMissingCount - 8} more`
                            : ""}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <PreviewModal
        open={!!pdfPreview}
        title={pdfPreview?.title ?? "CV"}
        wide
        onClose={() => setPdfPreview(null)}
      >
        {pdfPreview ? (
          <iframe
            title={`PDF: ${pdfPreview.title}`}
            src={`/api/cvs/${pdfPreview.cvId}/file`}
            className="h-[min(72vh,820px)] w-full rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900"
          />
        ) : null}
      </PreviewModal>
    </div>
  );
}

const CLOSABLE_LIST_MAX = 25;

function formatRunWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

type ClosableEmbJob =
  AnalyticsOverview["closableByEmbedding"]["jobs"][number];
type ClosableLlmJob = AnalyticsOverview["closableByLlm"]["jobs"][number];

function ClosableEmbeddingPanel({
  jobs,
  thresholdPercent,
  onOpenPdf,
}: {
  jobs: ClosableEmbJob[];
  thresholdPercent: number;
  onOpenPdf: (cvId: string, name: string) => void;
}) {
  const shown = jobs.slice(0, CLOSABLE_LIST_MAX);
  const more = jobs.length - shown.length;
  return (
    <div className="flex flex-col rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/90 to-white shadow-sm dark:border-emerald-900/45 dark:from-emerald-950/35 dark:to-zinc-950/80">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-emerald-200/70 px-4 py-3 dark:border-emerald-900/40">
        <div>
          <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
            Closable by embedding
          </h2>
          <p className="mt-0.5 text-xs text-emerald-900/75 dark:text-emerald-200/70">
            Jobs with at least one résumé ≥ {thresholdPercent}% similarity
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-600/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100">
          {jobs.length} role{jobs.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="min-h-[8rem] flex-1 p-2">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-200/80 bg-emerald-50/30 px-4 py-10 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">
              No roles meet this bar yet
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-emerald-900/70 dark:text-emerald-200/65">
              Lower the embedding threshold above or rebuild indices after adding
              CVs and jobs.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-emerald-200/50 dark:divide-emerald-900/35">
            {shown.map((j) => (
              <li
                key={j.jobDescriptionId}
                className="flex flex-col gap-2 px-2 py-3 first:pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {j.jobTitle}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400">
                    Best:{" "}
                    <button
                      type="button"
                      onClick={() => onOpenPdf(j.bestCvId, j.bestCvName)}
                      className="font-medium text-emerald-800 underline decoration-emerald-400/60 underline-offset-2 hover:decoration-emerald-700 dark:text-emerald-300 dark:decoration-emerald-500/50"
                    >
                      {j.bestCvName}
                    </button>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                  <span className="inline-flex items-center rounded-lg bg-emerald-100/90 px-2 py-1 text-xs font-semibold tabular-nums text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100">
                    {j.bestScorePercent}%
                  </span>
                  <span className="inline-flex items-center rounded-lg border border-emerald-200/80 bg-white/80 px-2 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-800/60 dark:bg-zinc-900/60 dark:text-emerald-200/90">
                    {j.candidatesAtOrAboveThreshold} at bar
                  </span>
                  <Link
                    href={`/evaluate?jobDescriptionId=${j.jobDescriptionId}`}
                    className="inline-flex rounded-lg bg-emerald-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    Evaluate
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {more > 0 ? (
        <p className="border-t border-emerald-200/60 px-4 py-2 text-center text-xs text-emerald-900/70 dark:border-emerald-900/40 dark:text-emerald-300/70">
          +{more} more not shown
        </p>
      ) : null}
    </div>
  );
}

function ClosableLlmPanel({
  jobs,
  thresholdScore,
}: {
  jobs: ClosableLlmJob[];
  thresholdScore: number;
}) {
  const shown = jobs.slice(0, CLOSABLE_LIST_MAX);
  const more = jobs.length - shown.length;
  return (
    <div className="flex flex-col rounded-2xl border border-violet-200/90 bg-gradient-to-b from-violet-50/90 to-white shadow-sm dark:border-violet-900/45 dark:from-violet-950/35 dark:to-zinc-950/80">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-violet-200/70 px-4 py-3 dark:border-violet-900/40">
        <div>
          <h2 className="text-base font-semibold text-violet-950 dark:text-violet-100">
            Closable by latest LLM run
          </h2>
          <p className="mt-0.5 text-xs text-violet-900/75 dark:text-violet-200/70">
            Per job, newest saved evaluation; score ≥ {thresholdScore}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-violet-600/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-violet-900 dark:bg-violet-400/15 dark:text-violet-100">
          {jobs.length} role{jobs.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="min-h-[8rem] flex-1 p-2">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-violet-200/80 bg-violet-50/30 px-4 py-10 text-center dark:border-violet-900/50 dark:bg-violet-950/20">
            <p className="text-sm font-medium text-violet-950 dark:text-violet-100">
              No qualifying LLM runs
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-violet-900/70 dark:text-violet-200/65">
              Run <Link href="/evaluate" className="font-medium underline">Evaluate</Link>{" "}
              or bulk LLM, or lower the LLM threshold.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-violet-200/50 dark:divide-violet-900/35">
            {shown.map((j) => (
              <li
                key={j.runId}
                className="flex flex-col gap-2 px-2 py-3 first:pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {j.jobTitle}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Run {formatRunWhen(j.runCreatedAt)} · best:{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {j.bestCvName}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                  <span className="inline-flex items-center rounded-lg bg-violet-100/90 px-2 py-1 text-xs font-semibold tabular-nums text-violet-950 dark:bg-violet-900/50 dark:text-violet-100">
                    {j.bestOverallScore}
                  </span>
                  <span className="inline-flex items-center rounded-lg border border-violet-200/80 bg-white/80 px-2 py-1 text-xs font-medium text-violet-900 dark:border-violet-800/60 dark:bg-zinc-900/60 dark:text-violet-200/90">
                    {j.candidatesAtOrAboveThreshold} at bar
                  </span>
                  <Link
                    href={`/dashboard/compare/${j.runId}`}
                    className="inline-flex rounded-lg bg-violet-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-900 dark:bg-violet-600 dark:hover:bg-violet-500"
                  >
                    Compare
                  </Link>
                  <Link
                    href={`/evaluate?jobDescriptionId=${j.jobDescriptionId}`}
                    className="inline-flex rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-900 shadow-sm hover:bg-violet-50 dark:border-violet-700 dark:bg-zinc-900 dark:text-violet-100 dark:hover:bg-violet-950/50"
                  >
                    Re-run
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {more > 0 ? (
        <p className="border-t border-violet-200/60 px-4 py-2 text-center text-xs text-violet-900/70 dark:border-violet-900/40 dark:text-violet-300/70">
          +{more} more not shown
        </p>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="min-h-[7.25rem] rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}
