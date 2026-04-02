"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CvStoredMeta, JobStoredMeta } from "@/lib/schemas";
import type {
  ApiCvList,
  ApiErrorBody,
  ApiJobList,
  EvaluateStreamEvent,
} from "@/components/ApiTypes";
import type { EvaluationRun } from "@/lib/schemas";
import {
  CV_SEARCH_FIELD_LABEL,
  cvMatchesSearchQuery,
} from "@/lib/cvSearchFilter";
import { EvaluateFormSkeleton } from "./EvaluateSkeleton";
import {
  evaluateCardClass,
  evaluateContainerClass,
  evaluateGridClass,
  evaluatePageClass,
  evaluateSectionLabelClass,
} from "./evaluateStyles";

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length > 1 ? w.slice(0, 2).toUpperCase() : `${w}•`.toUpperCase();
  }
  const a = parts[0]![0]!;
  const b = parts[parts.length - 1]![0]!;
  return `${a}${b}`.toUpperCase();
}

function shortUploadDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
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

export function EvaluateClient() {
  const searchParams = useSearchParams();
  const [cvs, setCvs] = useState<CvStoredMeta[]>([]);
  const [jobs, setJobs] = useState<JobStoredMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [selectedCv, setSelectedCv] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<EvaluationRun | null>(null);
  type ProgressRow = {
    cvId: string;
    displayName: string;
    state: "pending" | "running" | "done" | "error";
    score?: number;
    error?: string;
  };
  const [evaluateProgress, setEvaluateProgress] = useState<{
    items: ProgressRow[];
  } | null>(null);
  const [cvSearchQuery, setCvSearchQuery] = useState("");

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

  useEffect(() => {
    const q =
      searchParams.get("jobDescriptionId")?.trim() ||
      searchParams.get("job")?.trim();
    if (!q || jobs.length === 0) return;
    if (!jobs.some((j) => j.id === q)) return;
    setJobId(q);
  }, [searchParams, jobs]);

  const selectedIds = useMemo(
    () => Object.keys(selectedCv).filter((k) => selectedCv[k]),
    [selectedCv],
  );

  const filteredCvs = useMemo(
    () => cvs.filter((cv) => cvMatchesSearchQuery(cv, cvSearchQuery)),
    [cvs, cvSearchQuery],
  );

  const evaluateProgressStats = useMemo(() => {
    if (!evaluateProgress) return null;
    const { items } = evaluateProgress;
    const total = items.length;
    const finished = items.filter(
      (i) => i.state === "done" || i.state === "error",
    ).length;
    const pct = total ? Math.round((finished / total) * 100) : 0;
    return { total, finished, pct };
  }, [evaluateProgress]);

  const resumeListSummary = useMemo(() => {
    if (cvs.length === 0) return null;
    const q = cvSearchQuery.trim();
    const base =
      q.length > 0
        ? `${filteredCvs.length} of ${cvs.length} shown`
        : `${cvs.length} file${cvs.length === 1 ? "" : "s"}`;
    const sel =
      selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : "";
    return `${base}${sel}`;
  }, [cvs.length, cvSearchQuery, filteredCvs.length, selectedIds.length]);

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
    const progressItems: ProgressRow[] = selectedIds.map((id) => {
      const c = cvs.find((x) => x.id === id);
      const displayName = (c?.gemini?.name ?? c?.originalName ?? id).trim();
      return { cvId: id, displayName: displayName || id, state: "pending" };
    });
    setEvaluateProgress({ items: progressItems });
    setRunning(true);
    setLastRun(null);
    try {
      const res = await fetch("/api/evaluate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescriptionId: jobId, cvIds: selectedIds }),
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const json = (await res.json()) as ApiErrorBody;
          if (json.ok === false) message = json.error.message;
        } catch {
          /* use default */
        }
        setEvaluateProgress(null);
        setError(message);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setEvaluateProgress(null);
        setError("No response body");
        return;
      }

      const dec = new TextDecoder();
      let buf = "";
      const applyEvent = (msg: EvaluateStreamEvent) => {
        if (msg.type === "cv_start") {
          setEvaluateProgress((prev) => {
            if (!prev) return prev;
            return {
              items: prev.items.map((row) =>
                row.cvId === msg.cvId ? { ...row, state: "running" } : row,
              ),
            };
          });
        } else if (msg.type === "cv_done") {
          setEvaluateProgress((prev) => {
            if (!prev) return prev;
            return {
              items: prev.items.map((row) =>
                row.cvId === msg.cvId
                  ? {
                      ...row,
                      state:
                        msg.error !== undefined
                          ? ("error" as const)
                          : ("done" as const),
                      score: msg.overallScore,
                      error: msg.error,
                    }
                  : row,
              ),
            };
          });
        } else if (msg.type === "complete") {
          setLastRun(msg.run);
          setEvaluateProgress(null);
        } else if (msg.type === "fatal") {
          setError(msg.message);
          setEvaluateProgress((prev) => {
            if (!prev) return prev;
            return {
              items: prev.items.map((row) =>
                row.state === "running"
                  ? { ...row, state: "error", error: msg.message }
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
            applyEvent(JSON.parse(t) as EvaluateStreamEvent);
          } catch {
            setError("Invalid progress data from server");
            setEvaluateProgress(null);
            return;
          }
        }
        if (done) break;
      }
      const tail = buf.trim();
      if (tail) {
        try {
          applyEvent(JSON.parse(tail) as EvaluateStreamEvent);
        } catch {
          setError("Invalid progress data from server");
          setEvaluateProgress(null);
        }
      }
    } catch {
      setError("Evaluation request failed");
      setEvaluateProgress(null);
    } finally {
      setRunning(false);
    }
  }

  function toggleCv(id: string) {
    setSelectedCv((s) => ({ ...s, [id]: !s[id] }));
  }

  function selectAll() {
    const next: Record<string, boolean> = { ...selectedCv };
    for (const c of filteredCvs) next[c.id] = true;
    setSelectedCv(next);
  }

  function clearCv() {
    setSelectedCv({});
  }

  const formDisabled = running || loading;

  return (
    <div className={evaluatePageClass}>
      <div
        className={evaluateContainerClass}
        aria-busy={loading || running}
      >
        <header className="w-full">
          <p className={evaluateSectionLabelClass}>Match run</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Evaluate
          </h1>
          <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-white/80 p-4 text-sm leading-relaxed text-zinc-600 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            Pick <strong className="font-medium text-zinc-800 dark:text-zinc-200">one</strong>{" "}
            job and <strong className="font-medium text-zinc-800 dark:text-zinc-200">one or more</strong>{" "}
            CVs. Each résumé is scored separately against that role.
          </div>
        </header>

        {loading ? (
          <EvaluateFormSkeleton />
        ) : (
          <div className={evaluateGridClass}>
            <section className={evaluateCardClass}>
              <h2 className={evaluateSectionLabelClass}>Job description</h2>
              {jobs.length === 0 ? (
                <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-500">
                  No job descriptions yet.{" "}
                  <Link
                    href="/job-descriptions"
                    className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-100"
                  >
                    Add one
                  </Link>
                  .
                </p>
              ) : (
                <select
                  className="mt-5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm transition enabled:cursor-pointer enabled:hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:enabled:hover:border-zinc-500"
                  value={jobId}
                  disabled={formDisabled}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  <option value="">Select a job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {(j.titleGuess ?? j.originalName).slice(0, 80)}
                    </option>
                  ))}
                </select>
              )}
            </section>

            <section className={evaluateCardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={evaluateSectionLabelClass}>Résumés</h2>
                  {resumeListSummary ? (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {resumeListSummary}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={formDisabled || filteredCvs.length === 0}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={clearCv}
                    disabled={formDisabled || cvs.length === 0}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    None
                  </button>
                </div>
              </div>
              {cvs.length === 0 ? (
                <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-500">
                  No CVs yet.{" "}
                  <Link
                    href="/cvs"
                    className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:text-zinc-100"
                  >
                    Upload PDFs
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div className="relative mt-4">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
                      <SearchIcon className="size-4" />
                    </span>
                    <input
                      type="search"
                      autoComplete="off"
                      placeholder={CV_SEARCH_FIELD_LABEL}
                      aria-label={CV_SEARCH_FIELD_LABEL}
                      title="Searches name, title, skills, summary, file name, dates, and résumé text (same as CVs page)"
                      value={cvSearchQuery}
                      onChange={(e) => setCvSearchQuery(e.target.value)}
                      disabled={formDisabled}
                      className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500/25"
                    />
                  </div>
                  <div className="mt-3 flex min-h-[18rem] max-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-50/90 shadow-inner dark:border-zinc-800 dark:bg-zinc-900/35">
                    {filteredCvs.length === 0 ? (
                      <p className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
                        No résumés match “{cvSearchQuery.trim()}”. Clear the
                        search to see all.
                      </p>
                    ) : (
                      <ul className="divide-y divide-zinc-200/80 overflow-y-auto overscroll-contain dark:divide-zinc-800/90">
                        {filteredCvs.map((c) => {
                          const selected = !!selectedCv[c.id];
                          const displayName = (
                            c.gemini?.name?.trim() ||
                            c.originalName.replace(/\.[^.]+$/, "").trim() ||
                            c.originalName
                          ).trim();
                          const headline = c.gemini?.currentPosition?.trim();
                          const initials = initialsFromDisplayName(displayName);
                          const dateStr = shortUploadDate(c.uploadedAt);
                          return (
                            <li key={c.id}>
                              <label
                                className={`flex cursor-pointer items-center gap-3 px-3 py-3 transition sm:gap-4 sm:px-4 ${
                                  formDisabled
                                    ? "cursor-not-allowed opacity-50"
                                    : selected
                                      ? "bg-white ring-1 ring-inset ring-zinc-300/90 dark:bg-zinc-950 dark:ring-zinc-600"
                                      : "hover:bg-white/90 dark:hover:bg-zinc-950/65"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 shrink-0 rounded border-zinc-300 accent-zinc-900 focus:ring-2 focus:ring-zinc-400 focus:ring-offset-0 disabled:cursor-not-allowed dark:border-zinc-600 dark:accent-zinc-100 dark:focus:ring-zinc-500"
                                  checked={selected}
                                  disabled={formDisabled}
                                  onChange={() => toggleCv(c.id)}
                                />
                                <div
                                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tabular-nums ${
                                    selected
                                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                      : "bg-zinc-200/90 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                                  }`}
                                  aria-hidden
                                >
                                  {initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                    {displayName || "Untitled"}
                                  </span>
                                  {headline ? (
                                    <span className="mt-0.5 block truncate text-xs text-zinc-600 dark:text-zinc-300">
                                      {headline}
                                    </span>
                                  ) : null}
                                  <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-zinc-500 dark:text-zinc-500">
                                    <PdfIcon className="shrink-0 opacity-70" />
                                    <span className="truncate">{c.originalName}</span>
                                    {dateStr ? (
                                      <span className="shrink-0 text-zinc-400 dark:text-zinc-600">
                                        · {dateStr}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <button
            type="button"
            disabled={running || loading}
            onClick={() => void onRun()}
            className="inline-flex min-h-[44px] min-w-[11rem] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {loading ? (
              <>
                <Spinner className="h-4 w-4" />
                <span>Loading data…</span>
              </>
            ) : running ? (
              <>
                <Spinner className="h-4 w-4" />
                <span>Scoring…</span>
              </>
            ) : (
              "Run evaluation"
            )}
          </button>
          {running ? (
            <p
              className="text-sm text-zinc-500 dark:text-zinc-400"
              role="status"
              aria-live="polite"
            >
              Calling the AI model for each CV — this can take a little while.
            </p>
          ) : null}
        </div>

        {evaluateProgress && evaluateProgressStats ? (
          <div
            className="mt-6 w-full rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={evaluateProgressStats.pct}
            aria-label="Evaluation progress"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Progress
              </p>
              <p className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                {evaluateProgressStats.finished} / {evaluateProgressStats.total}{" "}
                résumés
              </p>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-900 transition-[width] duration-300 ease-out motion-reduce:transition-none dark:bg-zinc-100"
                style={{
                  width: `${evaluateProgressStats.pct}%`,
                }}
              />
            </div>
            <ul className="mt-4 max-h-60 space-y-2 overflow-y-auto overscroll-contain pr-1 text-sm">
              {evaluateProgress.items.map((row) => (
                <li
                  key={row.cvId}
                  className="flex items-start gap-2.5 rounded-lg py-1"
                >
                  <span className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400">
                    {row.state === "pending" ? (
                      <span
                        className="block size-4 rounded-full border-2 border-zinc-300 dark:border-zinc-600"
                        aria-hidden
                      />
                    ) : row.state === "running" ? (
                      <Spinner className="size-4 text-zinc-700 dark:text-zinc-200" />
                    ) : row.state === "done" ? (
                      <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <span
                        className="flex size-4 items-center justify-center text-base font-bold leading-none text-red-600 dark:text-red-400"
                        aria-hidden
                      >
                        ×
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {row.displayName}
                    </span>
                    {row.state === "done" && row.score !== undefined ? (
                      <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        Score {row.score}
                      </span>
                    ) : null}
                    {row.state === "error" && row.error ? (
                      <span className="block text-xs text-red-700 dark:text-red-300">
                        {row.error}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p
            className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/80 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {lastRun ? (
          <div className="mt-8 w-full rounded-2xl border border-emerald-200/90 bg-emerald-50/90 p-5 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              Evaluation complete
            </p>
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200/95">
              Run{" "}
              <code className="rounded-md bg-emerald-100/90 px-1.5 py-0.5 text-xs dark:bg-emerald-950">
                {lastRun.id.slice(0, 8)}…
              </code>{" "}
              saved.
            </p>
            <Link
              href={`/dashboard/compare/${lastRun.id}`}
              className="mt-4 inline-flex rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 dark:bg-emerald-300 dark:text-emerald-950 dark:hover:bg-emerald-200"
            >
              View comparison
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
