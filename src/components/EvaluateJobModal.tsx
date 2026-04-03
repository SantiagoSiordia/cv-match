"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CvStoredMeta, EvaluationRun } from "@/lib/schemas";
import type {
  ApiCvList,
  ApiErrorBody,
  EvaluateStreamEvent,
} from "@/components/ApiTypes";
import {
  CV_SEARCH_FIELD_LABEL,
  cvMatchesSearchQuery,
} from "@/lib/cvSearchFilter";

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

export type EvaluateJobModalProps = {
  open: boolean;
  onClose: () => void;
  jobDescriptionId: string;
  jobTitle: string;
  /** CVs to pre-select when the modal opens (e.g. embedding top 3). */
  initialSelectedCvIds?: string[];
  /** After a run is saved successfully. */
  onRunComplete?: () => void;
};

type ProgressRow = {
  cvId: string;
  displayName: string;
  state: "pending" | "running" | "done" | "error";
  score?: number;
  error?: string;
};

export function EvaluateJobModal({
  open,
  onClose,
  jobDescriptionId,
  jobTitle,
  initialSelectedCvIds,
  onRunComplete,
}: EvaluateJobModalProps) {
  const [cvs, setCvs] = useState<CvStoredMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCv, setSelectedCv] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<EvaluationRun | null>(null);
  const [evaluateProgress, setEvaluateProgress] = useState<{
    items: ProgressRow[];
  } | null>(null);
  const [cvSearchQuery, setCvSearchQuery] = useState("");

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

  const loadCvs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cvs");
      const json = (await res.json()) as
        | { ok: true; data: ApiCvList }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setCvs(json.data.items);
    } catch {
      setError("Could not load résumés");
    } finally {
      setLoading(false);
    }
  }, []);

  const initialKey = initialSelectedCvIds?.join("\0") ?? "";

  useEffect(() => {
    if (!open) {
      setSelectedCv({});
      setError(null);
      setEvaluateProgress(null);
      setLastRun(null);
      setRunning(false);
      setCvSearchQuery("");
      return;
    }
    void loadCvs();
    const next: Record<string, boolean> = {};
    for (const id of initialSelectedCvIds ?? []) next[id] = true;
    setSelectedCv(next);
    setError(null);
    setEvaluateProgress(null);
    setLastRun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialKey encodes initialSelectedCvIds
  }, [open, jobDescriptionId, initialKey, loadCvs]);

  function toggleCv(id: string) {
    setSelectedCv((s) => ({ ...s, [id]: !s[id] }));
  }

  function selectAllFiltered() {
    const next: Record<string, boolean> = { ...selectedCv };
    for (const c of filteredCvs) next[c.id] = true;
    setSelectedCv(next);
  }

  function clearSelection() {
    setSelectedCv({});
  }

  async function onRun() {
    setError(null);
    if (!selectedIds.length) {
      setError("Select at least one CV");
      return;
    }
    const progressItems: ProgressRow[] = selectedIds.map((id) => {
      const c = cvs.find((x) => x.id === id);
      const displayName = (c?.originalName ?? c?.gemini?.name ?? id).trim();
      return { cvId: id, displayName: displayName || id, state: "pending" };
    });
    setEvaluateProgress({ items: progressItems });
    setRunning(true);
    setLastRun(null);
    try {
      const res = await fetch("/api/evaluate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescriptionId,
          cvIds: selectedIds,
        }),
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const json = (await res.json()) as ApiErrorBody;
          if (json.ok === false) message = json.error.message;
        } catch {
          /* default */
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
          onRunComplete?.();
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

  const formDisabled = running || loading;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evaluate-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="scrollbar-app relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:max-h-[85vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Evaluate
            </p>
            <h2
              id="evaluate-modal-title"
              className="mt-0.5 line-clamp-2 text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {jobTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Choose résumés to score with the LLM for this job.{" "}
            <Link
              href={`/evaluate?jobDescriptionId=${jobDescriptionId}`}
              className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400"
              onClick={onClose}
            >
              Open full Evaluate page
            </Link>
          </p>

          {loading ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
              <Spinner />
              Loading résumés…
            </div>
          ) : cvs.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">
              No CVs yet.{" "}
              <Link href="/cvs" className="font-medium underline">
                Upload PDFs
              </Link>
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                    <SearchIcon className="size-4" />
                  </span>
                  <input
                    type="search"
                    autoComplete="off"
                    placeholder={CV_SEARCH_FIELD_LABEL}
                    aria-label={CV_SEARCH_FIELD_LABEL}
                    value={cvSearchQuery}
                    onChange={(e) => setCvSearchQuery(e.target.value)}
                    disabled={formDisabled}
                    className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-8 pr-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    disabled={formDisabled || filteredCvs.length === 0}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    All shown
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={formDisabled}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    None
                  </button>
                </div>
              </div>

              <ul className="scrollbar-app mt-3 max-h-52 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {filteredCvs.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-zinc-500">
                    No résumés match your search.
                  </li>
                ) : (
                  filteredCvs.map((c) => {
                    const selected = !!selectedCv[c.id];
                    return (
                      <li key={c.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm ${
                            formDisabled
                              ? "cursor-not-allowed opacity-50"
                              : selected
                                ? "bg-teal-50/80 dark:bg-teal-950/30"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 rounded border-zinc-300 accent-teal-600 dark:border-zinc-600"
                            checked={selected}
                            disabled={formDisabled}
                            onChange={() => toggleCv(c.id)}
                          />
                          <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-100">
                            {c.originalName}
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={formDisabled || !selectedIds.length}
              onClick={() => void onRun()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {running ? (
                <>
                  <Spinner />
                  Scoring…
                </>
              ) : (
                "Run evaluation"
              )}
            </button>
            {selectedIds.length > 0 ? (
              <span className="text-xs text-zinc-500">
                {selectedIds.length} selected
              </span>
            ) : null}
          </div>

          {evaluateProgress && evaluateProgressStats ? (
            <div
              className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
              role="status"
            >
              <div className="flex justify-between text-sm font-medium text-zinc-900 dark:text-zinc-50">
                <span>Progress</span>
                <span className="tabular-nums text-zinc-500">
                  {evaluateProgressStats.finished} / {evaluateProgressStats.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-teal-600 transition-[width] dark:bg-teal-500"
                  style={{
                    width: `${evaluateProgressStats.pct}%`,
                  }}
                />
              </div>
              <ul className="scrollbar-app mt-3 max-h-36 space-y-1.5 overflow-y-auto text-sm">
                {evaluateProgress.items.map((row) => (
                  <li key={row.cvId} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                      {row.state === "pending" ? (
                        <span className="block size-3.5 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />
                      ) : row.state === "running" ? (
                        <Spinner className="size-3.5" />
                      ) : row.state === "done" ? (
                        <CheckIcon className="size-3.5 text-emerald-600" />
                      ) : (
                        <span className="text-red-600">×</span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate font-medium text-zinc-800 dark:text-zinc-200">
                        {row.displayName}
                      </span>
                      {row.state === "done" && row.score !== undefined ? (
                        <span className="text-xs tabular-nums text-zinc-500">
                          Score {row.score}
                        </span>
                      ) : null}
                      {row.state === "error" && row.error ? (
                        <span className="text-xs text-red-600 dark:text-red-400">
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
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {lastRun ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/35">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Run saved
              </p>
              <Link
                href={`/dashboard/compare/${lastRun.id}`}
                className="mt-3 inline-flex rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 dark:bg-emerald-600"
                onClick={onClose}
              >
                View comparison
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
