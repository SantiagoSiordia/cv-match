"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AnalyticsOverview } from "@/lib/analytics";
import type { ApiErrorBody } from "@/components/ApiTypes";
import { EvaluateJobModal } from "@/components/EvaluateJobModal";
import { PreviewModal } from "@/components/PreviewModal";

/** Stable min width so table columns don’t jump between loading and loaded. */
const JOBS_TABLE_MIN_WIDTH = "62rem";

/** Skills column: show this many tags inline; rest collapse (full list on hover / SR label). */
const SKILLS_PREVIEW_COUNT = 6;

/** Fixed server-side-style bar for text overlap counts (UI control removed). */
const DEFAULT_EMBEDDING_THRESHOLD_PERCENT = 55;

function clampLlmScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m8.25 4.5 7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}

function DownloadCsvIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}

function initialCvIdsForJobRow(
  row: AnalyticsOverview["jobRows"][number],
): string[] | undefined {
  if (row.top3Embedding.length > 0) {
    return row.top3Embedding.map((t) => t.cvId);
  }
  if (row.bestEmbedding) return [row.bestEmbedding.cvId];
  return undefined;
}

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
    "top_match_skills",
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
        escapeCsvCell(row.topMatchSkills.join("; ")),
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
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="h-2.5 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-1.5 h-2.5 w-[85%] max-w-[11rem] animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

function JobsTableSkeleton() {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.35)]">
      <div className="flex animate-pulse flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-white px-5 py-4 dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950">
        <div className="h-5 w-52 rounded-md bg-zinc-200 dark:bg-zinc-700" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="size-9 shrink-0 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed text-left text-sm"
          style={{ minWidth: JOBS_TABLE_MIN_WIDTH }}
        >
          <thead className="border-b border-zinc-200/90 bg-zinc-50/90 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <tr>
              <th className="w-[16%] px-5 py-3.5">Role</th>
              <th className="w-[10%] px-5 py-3.5">Text overlap</th>
              <th className="w-[20%] px-5 py-3.5">Skills</th>
              <th className="w-[28%] px-5 py-3.5">Top résumés</th>
              <th className="w-[14%] px-5 py-3.5">AI fit</th>
              <th className="w-[12%] px-5 py-3.5 text-right">Review</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_, i) => (
              <tr
                key={i}
                className="border-b border-zinc-100/80 dark:border-zinc-800/70"
              >
                <td className="px-5 py-4">
                  <div className="h-4 w-[85%] animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
                </td>
                <td className="px-5 py-4">
                  <div className="space-y-1.5">
                    <div className="h-4 w-10 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-1.5 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    <div className="h-6 w-14 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-6 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-6 w-12 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-8 w-24 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-8 w-28 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-8 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="h-4 w-[65%] animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
                </td>
                <td className="px-5 py-4">
                  <div className="ml-auto h-8 w-[4.5rem] animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [llmThreshold, setLlmThreshold] = useState(75);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{
    cvId: string;
    title: string;
  } | null>(null);
  const [jobsTableFilter, setJobsTableFilter] = useState("");
  /** Debounced LLM threshold only (embedding bar is fixed). */
  const [debouncedLlm, setDebouncedLlm] = useState(llmThreshold);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedLlm(llmThreshold), 400);
    return () => clearTimeout(t);
  }, [llmThreshold]);

  const [evaluateModal, setEvaluateModal] = useState<{
    jobId: string;
    jobTitle: string;
    initialCvIds?: string[];
  } | null>(null);

  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (immediateLlmThreshold?: number) => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;

    const llmArg =
      immediateLlmThreshold !== undefined
        ? clampLlmScore(immediateLlmThreshold)
        : debouncedLlm;

    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        embeddingThreshold: String(DEFAULT_EMBEDDING_THRESHOLD_PERCENT),
        llmThreshold: String(llmArg),
      });
      const res = await fetch(`/api/analytics/overview?${q}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const json = (await res.json()) as
        | { ok: true; data: { overview: AnalyticsOverview } }
        | ApiErrorBody;
      if (ac.signal.aborted) return;
      if (!json.ok) {
        setError(json.error.message);
        setOverview(null);
        return;
      }
      const ov = json.data?.overview;
      if (!ov) {
        setError("Invalid analytics response");
        setOverview(null);
        return;
      }
      setOverview(ov);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError("Could not load analytics");
      setOverview(null);
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
      }
    }
  }, [debouncedLlm]);

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

  const filteredJobRows = useMemo(() => {
    if (!overview) return [];
    const q = jobsTableFilter.trim().toLowerCase();
    if (!q) return overview.jobRows;
    return overview.jobRows.filter((row) => {
      if (row.jobTitle.toLowerCase().includes(q)) return true;
      const best = (row.bestEmbedding?.cvName ?? "").toLowerCase();
      if (best.includes(q)) return true;
      const llmName = (row.bestLlm?.cvName ?? "").toLowerCase();
      if (llmName.includes(q)) return true;
      if (
        (row.topMatchSkills ?? []).some((s) =>
          s.toLowerCase().includes(q),
        )
      ) {
        return true;
      }
      return row.top3Embedding.some((t) =>
        (t.cvName ?? "").toLowerCase().includes(q),
      );
    });
  }, [overview, jobsTableFilter]);

  function openCvPdf(cvId: string, displayName: string) {
    setPdfPreview({ cvId, title: displayName });
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Pipeline overview
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            See which roles have strong résumé matches, open PDFs in one click,
            and jump to a saved AI comparison when one exists—or start a review
            when it does not.
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

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                AI fit score threshold
              </h2>
              <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Roles at or above this score count toward “Strong AI reviews”
                and related summaries. Adjustments apply after a short pause,
                then data reloads automatically.
              </p>
            </div>

            <div className="w-full shrink-0 space-y-4 lg:max-w-md">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor="analytics-llm-threshold"
                    className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Minimum score
                  </label>
                  <span className="tabular-nums text-xs text-zinc-500 dark:text-zinc-500">
                    0–100
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="analytics-llm-threshold"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={llmThreshold}
                    onChange={(e) =>
                      setLlmThreshold(clampLlmScore(Number(e.target.value)))
                    }
                    className="h-2 w-full cursor-pointer accent-blue-600 sm:flex-1 dark:accent-blue-500"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={llmThreshold}
                  />
                  <div className="flex shrink-0 items-center gap-1.5 sm:justify-end">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      value={llmThreshold}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber;
                        if (Number.isNaN(v)) return;
                        setLlmThreshold(clampLlmScore(v));
                      }}
                      className="w-16 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center text-sm font-medium tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100"
                      aria-label="AI fit score threshold value"
                    />
                    <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-500">
                      / 100
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load(llmThreshold)}
                  title="Fetch the latest summary and jobs table using the score above (no need to wait for auto-refresh)."
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Refresh data
                </button>
                <details className="group rounded-lg border border-zinc-200 bg-zinc-50/80 text-sm dark:border-zinc-700 dark:bg-zinc-900/40">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
                    <ChevronRightIcon className="size-4 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-90" />
                    How thresholds work
                  </summary>
                  <p className="border-t border-zinc-200 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                    The AI fit score bar controls which roles count in “Strong AI
                    reviews” and related lists. Changing it waits briefly, then
                    refreshes automatically. Text overlap counts use a fixed bar
                    on the server ({DEFAULT_EMBEDDING_THRESHOLD_PERCENT}%).
                  </p>
                </details>
              </div>
            </div>
          </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {initialLoad ? (
        <>
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            Loading pipeline overview. Large libraries can take a few minutes —
            this page updates when ready.
          </p>
          <div
            className="mt-8 overflow-x-auto pb-0.5 md:overflow-visible"
            aria-busy="true"
            aria-label="Loading summary"
          >
            <div className="grid min-w-[520px] grid-cols-4 gap-2 md:min-w-0">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
          </div>
          <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <section className="mt-10">
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
            className={`relative mt-8 overflow-x-auto pb-0.5 md:overflow-visible ${refreshing ? "opacity-70" : ""} transition-opacity`}
            aria-busy={refreshing}
          >
            <div className="grid min-w-[520px] grid-cols-4 gap-2 md:min-w-0">
              <StatCard
                label="Résumés · roles"
                value={`${overview.counts.cvs} / ${overview.counts.jobs}`}
                hint={`${overview.counts.cvsWithExtractedText} · ${overview.counts.jobsWithExtractedText} with text`}
              />
              <StatCard
                label="Text overlap hits"
                value={String(overview.closableByEmbedding.count)}
                hint={`≥ ${overview.thresholds.embeddingPercent}% (fixed bar)`}
              />
              <StatCard
                label="AI score hits"
                value={String(overview.closableByLlm.count)}
                hint={`Latest score ≥ ${overview.thresholds.llmOverall}`}
              />
              <StatCard
                label="Reviews (7d)"
                value={String(overview.counts.evaluationRunsLast7Days)}
                hint={`${overview.counts.evaluationRuns} total saved`}
              />
            </div>
          </div>

          <section className="mt-10">
            <div className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.35)]">
              {refreshing ? (
                <div
                  className="pointer-events-none absolute inset-0 z-[1] bg-white/55 backdrop-blur-[1px] dark:bg-zinc-950/55"
                  aria-hidden
                />
              ) : null}
              <div className="relative z-0 flex flex-col gap-3 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-white px-5 py-4 dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Roles and strongest matches
                  </h2>
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-xs lg:max-w-md">
                  <label className="sr-only" htmlFor="analytics-jobs-filter">
                    Filter jobs and candidates
                  </label>
                  <input
                    id="analytics-jobs-filter"
                    type="search"
                    autoComplete="off"
                    placeholder="Search role or candidate…"
                    value={jobsTableFilter}
                    onChange={(e) => setJobsTableFilter(e.target.value)}
                    className="w-full min-w-0 rounded-xl border-0 bg-zinc-100/90 px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200/90 transition-shadow focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 dark:bg-zinc-900/80 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:ring-zinc-700 dark:focus:bg-zinc-950 dark:focus:ring-blue-400/25"
                  />
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full bg-zinc-100/90 px-3 py-1 text-xs font-medium tabular-nums text-zinc-700 ring-1 ring-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-200 dark:ring-zinc-700">
                    {jobsTableFilter.trim()
                      ? `${filteredJobRows.length} / ${overview.jobRows.length}`
                      : `${overview.jobRows.length} role${overview.jobRows.length === 1 ? "" : "s"}`}
                  </span>
                  {csvBlobUrl ? (
                    <a
                      href={csvBlobUrl}
                      download={`analytics-jobs-${overview.generatedAt.slice(0, 10)}.csv`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100/90 text-zinc-700 ring-1 ring-zinc-200/90 transition-colors hover:bg-white hover:ring-zinc-300 dark:bg-zinc-800/80 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-700"
                      title="Export spreadsheet (full list, not filtered)"
                      aria-label="Export spreadsheet as CSV"
                    >
                      <DownloadCsvIcon className="size-[18px]" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="scrollbar-app relative z-0 max-h-[min(70vh,36rem)] overflow-auto overscroll-contain">
                {overview.jobRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      No job descriptions yet
                    </p>
                    <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Add roles under Jobs to see matches here.
                    </p>
                  </div>
                ) : (
                  <table
                    className="w-full table-fixed text-left text-sm"
                    style={{ minWidth: JOBS_TABLE_MIN_WIDTH }}
                  >
                    <thead className="sticky top-0 z-[1] border-b border-zinc-200/90 bg-white/95 text-xs font-medium text-zinc-500 shadow-[0_1px_0_0_rgb(244_244_245)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-400 dark:shadow-[0_1px_0_0_rgb(39_39_42_/_0.7)]">
                      <tr>
                        <th className="w-[16%] px-5 py-3.5">Role</th>
                        <th
                          className="w-[10%] px-5 py-3.5"
                          title="Text overlap vs role description (not the same as hire fit)"
                        >
                          Text overlap
                        </th>
                        <th
                          className="w-[20%] px-5 py-3.5"
                          title="Skills from metadata for the top text match"
                        >
                          Skills
                        </th>
                        <th
                          className="w-[28%] px-5 py-3.5"
                          title="Three strongest text overlaps for this role"
                        >
                          Top résumés
                        </th>
                        <th className="w-[14%] px-5 py-3.5">AI fit</th>
                        <th className="w-[12%] px-5 py-3.5 text-right">
                          Review
                        </th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-b-0">
                      {filteredJobRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-5 py-12 text-center text-sm text-zinc-600 dark:text-zinc-400"
                          >
                            No jobs or candidates match “
                            {jobsTableFilter.trim()}”.
                          </td>
                        </tr>
                      ) : (
                        filteredJobRows.map((row) => {
                        const emb = row.bestEmbedding;
                        const atBar =
                          emb != null &&
                          emb.scorePercent >=
                            overview.thresholds.embeddingPercent;
                        return (
                          <tr
                            key={row.jobDescriptionId}
                            className="border-b border-zinc-100/80 transition-colors hover:bg-sky-50/45 dark:border-zinc-800/70 dark:hover:bg-zinc-900/55"
                          >
                            <td className="px-5 py-4 align-top">
                              <span className="line-clamp-2 text-[15px] font-medium leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
                                {row.jobTitle}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-top">
                              {emb != null ? (
                                <div className="flex max-w-[7rem] flex-col gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`text-sm font-semibold tabular-nums ${atBar ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-800 dark:text-zinc-200"}`}
                                    >
                                      {emb.scorePercent}%
                                    </span>
                                    {atBar ? (
                                      <span className="rounded-full bg-emerald-500/15 px-2 py-px text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-600/20 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-400/25">
                                        Bar
                                      </span>
                                    ) : null}
                                  </div>
                                  <div
                                    className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-700"
                                    title={`${emb.scorePercent}% text overlap`}
                                  >
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                                      style={{
                                        width: `${Math.min(100, emb.scorePercent)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-zinc-400 dark:text-zinc-500">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 align-top">
                              {row.topMatchSkills.length ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {row.topMatchSkills
                                    .slice(0, SKILLS_PREVIEW_COUNT)
                                    .map((skill, si) => (
                                      <span
                                        key={`${skill}-${si}`}
                                        className="max-w-[11rem] truncate rounded-full bg-zinc-100/95 px-2.5 py-1 text-xs font-medium leading-none text-zinc-800 ring-1 ring-zinc-200/90 dark:bg-zinc-800/70 dark:text-zinc-200 dark:ring-zinc-600/60"
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                  {row.topMatchSkills.length >
                                  SKILLS_PREVIEW_COUNT ? (
                                    <span
                                      className="shrink-0 rounded-full bg-zinc-200/80 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-700 ring-1 ring-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600"
                                      title={row.topMatchSkills.join(", ")}
                                      aria-label={`Also includes ${row.topMatchSkills.length - SKILLS_PREVIEW_COUNT} more: ${row.topMatchSkills.slice(SKILLS_PREVIEW_COUNT).join(", ")}`}
                                    >
                                      +
                                      {row.topMatchSkills.length -
                                        SKILLS_PREVIEW_COUNT}{" "}
                                      more
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-sm text-zinc-400 dark:text-zinc-500">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 align-top">
                              {row.top3Embedding.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {row.top3Embedding.map((t, i) => (
                                    <button
                                      key={t.cvId}
                                      type="button"
                                      onClick={() =>
                                        openCvPdf(t.cvId, t.cvName)
                                      }
                                      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-zinc-100/90 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-900 ring-1 ring-zinc-200/90 transition hover:bg-white hover:ring-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800 dark:hover:ring-zinc-500"
                                      title="Open PDF preview"
                                      aria-label={`Open PDF for ${t.cvName}, rank ${i + 1}`}
                                    >
                                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold tabular-nums text-zinc-700 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-600">
                                        {i + 1}
                                      </span>
                                      <span className="min-w-0 truncate">
                                        {t.cvName}
                                      </span>
                                      <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                                        {t.scorePercent}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-zinc-400 dark:text-zinc-500">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 align-top">
                              {row.bestLlm ? (
                                <div className="flex min-w-0 flex-col gap-1.5">
                                  <span className="line-clamp-2 text-sm leading-snug text-zinc-700 dark:text-zinc-300">
                                    {row.bestLlm.cvName}
                                  </span>
                                  <span className="inline-flex w-fit items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-violet-900 ring-1 ring-violet-200/80 dark:bg-violet-950/60 dark:text-violet-200 dark:ring-violet-700/50">
                                    {row.bestLlm.overallScore}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm text-zinc-400 dark:text-zinc-500">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 align-top text-right">
                              {row.bestLlm ? (
                                <Link
                                  href={`/dashboard/compare/${row.bestLlm.runId}`}
                                  className="inline-flex items-center justify-center rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
                                >
                                  Review
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEvaluateModal({
                                      jobId: row.jobDescriptionId,
                                      jobTitle: row.jobTitle,
                                      initialCvIds: initialCvIdsForJobRow(row),
                                    })
                                  }
                                  className="inline-flex items-center justify-center rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
                                >
                                  Review
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
            <ClosableEmbeddingPanel
              jobs={overview.closableByEmbedding.jobs}
              thresholdPercent={overview.thresholds.embeddingPercent}
              onOpenPdf={openCvPdf}
              onOpenEvaluate={(j) =>
                setEvaluateModal({
                  jobId: j.jobDescriptionId,
                  jobTitle: j.jobTitle,
                  initialCvIds: [j.bestCvId],
                })
              }
            />
            <ClosableLlmPanel
              jobs={overview.closableByLlm.jobs}
              thresholdScore={overview.thresholds.llmOverall}
            />
          </section>

          <details className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/30">
            <summary className="cursor-pointer text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Training opportunities
            </summary>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Skills many roles ask for that often appear missing from résumé
              lists—useful for upskilling conversations.
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
          </details>
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

      <EvaluateJobModal
        open={evaluateModal !== null}
        onClose={() => setEvaluateModal(null)}
        jobDescriptionId={evaluateModal?.jobId ?? ""}
        jobTitle={evaluateModal?.jobTitle ?? ""}
        initialSelectedCvIds={evaluateModal?.initialCvIds}
        onRunComplete={() => void load()}
      />
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
  onOpenEvaluate,
}: {
  jobs: ClosableEmbJob[];
  thresholdPercent: number;
  onOpenPdf: (cvId: string, name: string) => void;
  onOpenEvaluate: (job: ClosableEmbJob) => void;
}) {
  const shown = jobs.slice(0, CLOSABLE_LIST_MAX);
  const more = jobs.length - shown.length;
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Strong text matches
          </h2>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            Roles with at least one résumé at ≥ {thresholdPercent}% text overlap
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {jobs.length} role{jobs.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="min-h-[8rem] flex-1 p-2">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              No roles meet this bar yet
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              No roles reach the overlap bar yet—add résumés or roles with
            readable text.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                    Top résumé:{" "}
                    <button
                      type="button"
                      onClick={() => onOpenPdf(j.bestCvId, j.bestCvName)}
                      className="font-medium text-zinc-900 underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600"
                    >
                      {j.bestCvName}
                    </button>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                  <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold tabular-nums text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                    {j.bestScorePercent}%
                  </span>
                  <span className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {j.candidatesAtOrAboveThreshold} meet bar
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenEvaluate(j)}
                    className="inline-flex rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    Review
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {more > 0 ? (
        <p className="border-t border-zinc-200 px-4 py-2 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
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
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Latest AI reviews
          </h2>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            Newest saved score per role; showing ≥ {thresholdScore}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {jobs.length} role{jobs.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="min-h-[8rem] flex-1 p-2">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              No saved reviews in range
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Open{" "}
              <Link href="/evaluate" className="font-medium underline">
                Evaluate
              </Link>{" "}
              or use Review on a role below, or lower the AI threshold.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                    {formatRunWhen(j.runCreatedAt)} · top candidate{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {j.bestCvName}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                  <span className="inline-flex items-center rounded-lg bg-violet-100 px-2 py-1 text-xs font-semibold tabular-nums text-violet-950 dark:bg-violet-950/55 dark:text-violet-200">
                    {j.bestOverallScore}
                  </span>
                  <span className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {j.candidatesAtOrAboveThreshold} meet bar
                  </span>
                  <Link
                    href={`/dashboard/compare/${j.runId}`}
                    className="inline-flex rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    Review
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {more > 0 ? (
        <p className="border-t border-zinc-200 px-4 py-2 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
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
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-[11px] font-medium leading-tight text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums leading-none text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
        {hint}
      </p>
    </div>
  );
}
