"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AnalyticsOverview } from "@/lib/analytics";
import type { ApiErrorBody } from "@/components/ApiTypes";
import type { TextOverlapBand } from "@/lib/textOverlapBands";
import { EvaluateJobModal } from "@/components/EvaluateJobModal";
import { PreviewModal } from "@/components/PreviewModal";

/** Stable min width so table columns don’t jump between loading and loaded. */
const JOBS_TABLE_MIN_WIDTH = "64rem";

/** Skills column: show this many tags inline; rest collapse (full list on hover / SR label). */
const SKILLS_PREVIEW_COUNT = 6;

/** Fixed server-side-style bar for text overlap counts (UI control removed). */
const DEFAULT_EMBEDDING_THRESHOLD_PERCENT = 55;

/** Minimum AI fit score for analytics (fixed; overview API query param). */
const DEFAULT_LLM_THRESHOLD = 75;

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

/** Outline document with folded corner (PDF export row). */
function DocumentPdfIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/** Grid / table (CSV export row). */
function TableCsvIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125V5.625m18.75 12.75a1.125 1.125 0 0 1-1.125 1.125m-16.5 0V5.625m0 0A1.125 1.125 0 0 1 5.25 4.5h13.5a1.125 1.125 0 0 1 1.125 1.125m-15.75 0v.243a48.72 48.72 0 0 0 5.25-.243m-5.25 0v-.243c0-.621.504-1.125 1.125-1.125h11.25c.621 0 1.125.504 1.125 1.125v.243M7.5 9.75h9m-9 3h9m-9 3h9m-9 3h9"
      />
    </svg>
  );
}

function safePdfFilenameBase(title: string): string {
  const base = title
    .replace(/\.[^.]+$/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
    .trim();
  return base.length ? base : "analytics-report";
}

function PdfDownloadSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin motion-reduce:animate-none ${className ?? "size-4"}`}
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

function textOverlapBandDisplay(band: TextOverlapBand): string {
  return band === "weak" ? "Weak" : band === "moderate" ? "Moderate" : "Strong";
}

function textOverlapBandPillClass(band: TextOverlapBand): string {
  const base =
    "rounded-full px-2 py-px text-[10px] font-semibold ring-1 tabular-nums";
  switch (band) {
    case "weak":
      return `${base} bg-zinc-500/12 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-500/20 dark:text-zinc-200 dark:ring-zinc-400/25`;
    case "moderate":
      return `${base} bg-sky-500/15 text-sky-900 ring-sky-600/20 dark:bg-sky-400/15 dark:text-sky-100 dark:ring-sky-400/25`;
    case "strong":
      return `${base} bg-emerald-500/15 text-emerald-900 ring-emerald-600/20 dark:bg-emerald-400/15 dark:text-emerald-100 dark:ring-emerald-400/25`;
  }
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
      <div className="flex animate-pulse flex-nowrap items-center gap-3 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-white px-5 py-4 dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950">
        <div className="h-5 w-52 shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-9 min-w-0 flex-1 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
        <div className="size-10 shrink-0 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed text-left text-sm"
          style={{ minWidth: JOBS_TABLE_MIN_WIDTH }}
        >
          <thead className="border-b border-zinc-200/90 bg-zinc-50/90 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <tr>
              <th className="w-[16%] px-5 py-3.5">Role</th>
              <th className="w-[12%] px-5 py-3.5">Text overlap</th>
              <th className="w-[18%] px-5 py-3.5">Skills</th>
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

/**
 * Renders a stable placeholder on the server and on the client’s first paint, then
 * swaps in the detailed skeleton after mount so SSR and hydration always match.
 */
function JobsTableSkeletonGate() {
  const [showDetail, setShowDetail] = useState(false);
  useEffect(() => {
    setShowDetail(true);
  }, []);
  if (!showDetail) {
    return (
      <div
        className="mt-3 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.35)]"
        aria-busy="true"
        aria-label="Loading roles table"
      >
        <div className="h-[min(70vh,36rem)] min-h-[12rem] animate-pulse bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900/40 dark:to-zinc-950" />
      </div>
    );
  }
  return <JobsTableSkeleton />;
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
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{
    cvId: string;
    title: string;
  } | null>(null);
  const [jobsTableFilter, setJobsTableFilter] = useState("");

  const [evaluateModal, setEvaluateModal] = useState<{
    jobId: string;
    jobTitle: string;
    initialCvIds?: string[];
  } | null>(null);
  const [skillsModal, setSkillsModal] = useState<{
    jobTitle: string;
    skills: string[];
  } | null>(null);
  const [pdfDownloadLoading, setPdfDownloadLoading] = useState(false);
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const loadAbortRef = useRef<AbortController | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;

    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        embeddingThreshold: String(DEFAULT_EMBEDDING_THRESHOLD_PERCENT),
        llmThreshold: String(DEFAULT_LLM_THRESHOLD),
      });
      const res = await fetch(`/api/analytics/overview?${q}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      if (loadAbortRef.current !== ac) return;
      const json = (await res.json()) as
        | { ok: true; data: { overview: AnalyticsOverview } }
        | ApiErrorBody;
      if (loadAbortRef.current !== ac) return;
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
      if (loadAbortRef.current !== ac) return;
      if (e instanceof Error && e.name === "AbortError") return;
      setError("Could not load analytics");
      setOverview(null);
    } finally {
      if (loadAbortRef.current === ac) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [load]);

  async function downloadAnalyticsPdf() {
    setPdfDownloadError(null);
    setPdfDownloadLoading(true);
    const url = "/api/analytics/report";
    try {
      const res = await fetch(url);
      const ct = res.headers.get("Content-Type") ?? "";
      if (!res.ok) {
        if (ct.includes("application/json")) {
          const j = (await res.json()) as ApiErrorBody;
          setPdfDownloadError(
            j.ok === false ? j.error.message : `PDF failed (${res.status})`,
          );
        } else {
          setPdfDownloadError(`PDF download failed (${res.status})`);
        }
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let filename = `${safePdfFilenameBase("analytics-report")}.pdf`;
      if (cd) {
        const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i.exec(cd);
        const raw = m?.[1]?.trim();
        if (raw) {
          try {
            filename = decodeURIComponent(raw.replace(/^UTF-8''/i, ""));
          } catch {
            filename = raw.replace(/^UTF-8''/i, "");
          }
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      setPdfDownloadError(
        "Could not download PDF. Check your connection and try again.",
      );
    } finally {
      setPdfDownloadLoading(false);
    }
  }

  useEffect(() => {
    if (!exportMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      const el = exportMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExportMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [exportMenuOpen]);

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
            Analytics
          </h1>
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

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex rounded-lg bg-red-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 dark:bg-red-200 dark:text-red-950 dark:hover:bg-white"
          >
            Retry
          </button>
        </div>
      ) : null}

      {initialLoad ? (
        <>
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            Loading analytics. Large libraries can take a few minutes — this page
            updates when ready.
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
            <JobsTableSkeletonGate />
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

          <section
            className="mt-8 rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-3.5 text-sm leading-relaxed text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/45 dark:text-zinc-200"
            aria-labelledby="analytics-overlap-help-heading"
          >
            <h3
              id="analytics-overlap-help-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              How to read text overlap
            </h3>
            <p className="mt-2">
              <strong className="font-medium">Text overlap</strong> is embedding
              similarity between the role text and a résumé — useful for shortlisting,
              not the same as an AI hire-fit score. The percentage is unchanged for
              sorting and thresholds;{" "}
              <strong className="font-medium">Weak / Moderate / Strong</strong> bands
              describe the underlying cosine strength so similar-looking percentages are
              easier to compare.
            </p>
          </section>

          <section className="mt-10">
            <div className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.35)]">
              {refreshing ? (
                <div
                  className="pointer-events-none absolute inset-0 z-20 bg-white/55 backdrop-blur-[1px] dark:bg-zinc-950/55"
                  aria-hidden
                />
              ) : null}
              <div className="relative z-10 flex flex-nowrap items-center gap-3 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/90 to-white px-5 py-3 isolate sm:gap-4 sm:py-3.5 dark:border-zinc-800 dark:from-zinc-900/40 dark:to-zinc-950">
                <div className="min-w-0 max-w-[min(100%,22rem)] shrink sm:max-w-[min(100%,28rem)]">
                  <h2 className="flex min-w-0 items-baseline gap-x-2 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    <span className="min-w-0 truncate">
                      Roles and strongest matches
                    </span>
                    <span className="shrink-0 text-sm font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                      {jobsTableFilter.trim()
                        ? `${filteredJobRows.length} / ${overview.jobRows.length}`
                        : `${overview.jobRows.length} role${overview.jobRows.length === 1 ? "" : "s"}`}
                    </span>
                  </h2>
                </div>
                <div className="min-w-0 flex-1">
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
                    className="w-full min-w-0 max-w-xl rounded-xl border-0 bg-zinc-100/90 px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200/90 transition-shadow focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 dark:bg-zinc-900/80 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:ring-zinc-700 dark:focus:bg-zinc-950 dark:focus:ring-blue-400/25"
                  />
                </div>
                <div className="relative shrink-0">
                  {pdfDownloadError ? (
                    <span className="sr-only" role="status">
                      {pdfDownloadError}
                    </span>
                  ) : null}
                  <div ref={exportMenuRef} className="relative flex justify-end">
                    <button
                      type="button"
                      id="analytics-export-trigger"
                      aria-haspopup="menu"
                      aria-expanded={exportMenuOpen}
                      aria-controls="analytics-export-menu"
                      title={
                        pdfDownloadError && !exportMenuOpen
                          ? `Last export error: ${pdfDownloadError.length > 180 ? `${pdfDownloadError.slice(0, 180)}…` : pdfDownloadError}`
                          : "Exports: PDF report, Excel workbook, plain CSV"
                      }
                      onClick={() => setExportMenuOpen((o) => !o)}
                      className={`inline-flex size-10 items-center justify-center rounded-xl bg-zinc-100/90 text-zinc-800 transition-colors hover:bg-white dark:bg-zinc-800/80 dark:text-zinc-100 dark:hover:bg-zinc-700 ${
                        pdfDownloadError && !exportMenuOpen
                          ? "ring-2 ring-red-500/75 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950"
                          : "ring-1 ring-zinc-200/90 hover:ring-zinc-300 dark:ring-zinc-700 dark:hover:ring-zinc-600"
                      }`}
                    >
                      <DownloadCsvIcon
                        className="size-[18px] shrink-0"
                        aria-hidden
                      />
                      <span className="sr-only">Open export downloads</span>
                    </button>
                    {exportMenuOpen ? (
                      <div
                        id="analytics-export-menu"
                        role="menu"
                        aria-labelledby="analytics-export-trigger"
                        className="absolute right-0 top-full z-[100] mt-1.5 min-w-[15rem] rounded-xl border border-zinc-200/95 bg-white py-1 shadow-lg ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-white/10"
                      >
                        {pdfDownloadError ? (
                          <p className="mx-2 mb-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                            {pdfDownloadError}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          disabled={pdfDownloadLoading}
                          aria-busy={pdfDownloadLoading}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          onClick={() => void downloadAnalyticsPdf()}
                        >
                          <span className="flex size-[18px] shrink-0 items-center justify-center">
                            {pdfDownloadLoading ? (
                              <PdfDownloadSpinner className="size-4 text-teal-700 dark:text-teal-400" />
                            ) : (
                              <DocumentPdfIcon className="size-[18px] text-teal-700 dark:text-teal-400" />
                            )}
                          </span>
                          {pdfDownloadLoading
                            ? "Building PDF…"
                            : "Download PDF report"}
                        </button>
                        <a
                          role="menuitem"
                          href="/api/analytics/candidates-export"
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          onClick={() => setExportMenuOpen(false)}
                        >
                          <DownloadCsvIcon
                            className="size-[18px] shrink-0 text-emerald-700 dark:text-emerald-400"
                            aria-hidden
                          />
                          Excel (.xlsx)
                        </a>
                        <a
                          role="menuitem"
                          href="/api/analytics/candidates-export?format=csv"
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          onClick={() => setExportMenuOpen(false)}
                        >
                          <TableCsvIcon className="size-[18px] shrink-0 text-sky-700 dark:text-sky-400" />
                          Plain CSV
                        </a>
                      </div>
                    ) : null}
                  </div>
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
                          className="w-[12%] px-5 py-3.5"
                          title="Embedding text overlap vs role (not hire fit). Weak / Moderate / Strong = cosine bands."
                        >
                          Text overlap
                        </th>
                        <th
                          className="w-[18%] px-5 py-3.5"
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
                                <div className="flex max-w-[9rem] flex-col gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`text-sm font-semibold tabular-nums ${atBar ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-800 dark:text-zinc-200"}`}
                                    >
                                      {emb.scorePercent}%
                                    </span>
                                    {row.textOverlapBand != null ? (
                                      <span
                                        className={textOverlapBandPillClass(
                                          row.textOverlapBand,
                                        )}
                                        title={
                                          row.textOverlapCosine != null
                                            ? `Cosine similarity ${row.textOverlapCosine.toFixed(3)}`
                                            : undefined
                                        }
                                      >
                                        {textOverlapBandDisplay(row.textOverlapBand)}
                                      </span>
                                    ) : null}
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
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSkillsModal({
                                          jobTitle: row.jobTitle,
                                          skills: row.topMatchSkills,
                                        })
                                      }
                                      className="shrink-0 cursor-pointer rounded-full bg-zinc-200/80 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-700 ring-1 ring-zinc-300/80 transition hover:bg-zinc-300/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600 dark:hover:bg-zinc-700"
                                      title={row.topMatchSkills.join(", ")}
                                      aria-label={`Show all ${row.topMatchSkills.length} matching skills for ${row.jobTitle}. Also includes ${row.topMatchSkills.length - SKILLS_PREVIEW_COUNT} not shown inline: ${row.topMatchSkills.slice(SKILLS_PREVIEW_COUNT).join(", ")}`}
                                    >
                                      +
                                      {row.topMatchSkills.length -
                                        SKILLS_PREVIEW_COUNT}{" "}
                                      more
                                    </button>
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

      <PreviewModal
        open={skillsModal !== null}
        title={
          skillsModal
            ? `Matching skills — ${skillsModal.jobTitle}`
            : "Matching skills"
        }
        onClose={() => setSkillsModal(null)}
      >
        {skillsModal ? (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {skillsModal.skills.map((skill, i) => (
              <li key={`${skill}-${i}`}>
                <span className="inline-block rounded-full bg-zinc-100/95 px-2.5 py-1 text-xs font-medium leading-none text-zinc-800 ring-1 ring-zinc-200/90 dark:bg-zinc-800/70 dark:text-zinc-200 dark:ring-zinc-600/60">
                  {skill}
                </span>
              </li>
            ))}
          </ul>
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
                  <Link
                    href={`/job-descriptions/${j.jobDescriptionId}`}
                    className="inline-flex rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Compare
                  </Link>
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
