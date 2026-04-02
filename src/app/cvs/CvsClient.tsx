"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CvStoredMeta } from "@/lib/schemas";
import type { ApiCvList, ApiErrorBody } from "@/components/ApiTypes";
import {
  CV_SEARCH_FIELD_LABEL,
  cvMatchesSearchQuery,
} from "@/lib/cvSearchFilter";
import { PreviewModal } from "@/components/PreviewModal";

type JobMatchItem = {
  jobDescriptionId: string;
  title: string;
  scorePercent: number;
  cosineSimilarity: number;
  skipped?: boolean;
  skipReason?: string;
  justification?: string;
};

/** YYYY-MM-DD in UTC — avoids hydration mismatches from `toLocaleDateString()`. */
function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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

function RankedJobsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
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

export function CvsClient() {
  const [items, setItems] = useState<CvStoredMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [matchCvId, setMatchCvId] = useState<string | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchItems, setMatchItems] = useState<JobMatchItem[] | null>(null);
  const [matchLabel, setMatchLabel] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [resumeQuery, setResumeQuery] = useState("");
  const matchResultsRef = useRef<HTMLDivElement>(null);

  const hasMatchActivity =
    matchLoading || matchError !== null || matchItems !== null;

  const load = useCallback(async () => {
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
      setItems(json.data.items);
    } catch {
      setError("Could not load CVs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (matchLoading) return;
    if (matchError === null && matchItems === null) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      return;
    }
    matchResultsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [matchLoading, matchItems, matchError]);

  async function onUpload(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/cvs", { method: "POST", body: fd });
      const json = (await res.json()) as
        | { ok: true; data: { item: CvStoredMeta } }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      await load();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this CV?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/cvs/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: true } | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      await load();
    } catch {
      setError("Delete failed");
    }
  }

  async function onMatchJobs(cvId: string) {
    setMatchCvId(cvId);
    setMatchLoading(true);
    setMatchError(null);
    setMatchItems(null);
    setMatchLabel(null);
    try {
      const res = await fetch(`/api/cvs/${cvId}/match-jobs`, {
        method: "POST",
      });
      const json = (await res.json()) as
        | {
            ok: true;
            data: {
              items: JobMatchItem[];
              label?: string;
              cv: CvStoredMeta;
            };
          }
        | ApiErrorBody;
      if (!json.ok) {
        setMatchError(json.error.message);
        return;
      }
      setMatchItems(json.data.items);
      setMatchLabel(json.data.label ?? null);
      setItems((prev) =>
        prev.map((c) => (c.id === json.data.cv.id ? json.data.cv : c)),
      );
    } catch {
      setMatchError("Match request failed");
    } finally {
      setMatchLoading(false);
    }
  }

  async function openPreview(id: string) {
    setPreviewId(id);
    setPreviewText(null);
    try {
      const res = await fetch(`/api/cvs/${id}`);
      const json = (await res.json()) as
        | { ok: true; data: { extractedPreview: string } }
        | ApiErrorBody;
      if (!json.ok) {
        setPreviewText(json.error.message);
        return;
      }
      setPreviewText(json.data.extractedPreview || "(No extracted text)");
    } catch {
      setPreviewText("Could not load preview");
    }
  }

  const previewItem = previewId
    ? items.find((i) => i.id === previewId)
    : undefined;

  const activeMatchCv = matchCvId
    ? items.find((c) => c.id === matchCvId)
    : undefined;

  const filteredItems = useMemo(
    () => items.filter((cv) => cvMatchesSearchQuery(cv, resumeQuery)),
    [items, resumeQuery],
  );

  const resumeCountLabel = loading
    ? "…"
    : resumeQuery.trim()
      ? `${filteredItems.length} of ${items.length}`
      : String(items.length);

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-gradient-to-b from-zinc-100/90 via-white to-zinc-50/80 font-sans dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950/95">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          Library
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          CVs
        </h1>
        <div className="mt-4 max-w-3xl rounded-2xl border border-zinc-200/80 bg-white/80 p-4 text-sm leading-relaxed text-zinc-600 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
          Upload PDFs to{" "}
          <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.8rem] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            cvs-pdf
          </code>
          .{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            Match to jobs
          </strong>{" "}
          ranks each résumé against all job descriptions (embedding similarity,
          0–100%). On wide screens the report stays beside your list. Add roles
          under{" "}
          <Link
            href="/job-descriptions"
            className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400 dark:decoration-teal-400/30"
          >
            Jobs
          </Link>
          .
        </div>
      </header>

      <div className="rounded-2xl border border-zinc-200/90 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-none">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-8 transition-colors hover:border-teal-400/60 hover:bg-teal-50/40 focus-within:outline-none focus-within:ring-2 focus-within:ring-teal-500/30 focus-within:ring-offset-2 focus-within:ring-offset-white dark:border-zinc-700 dark:bg-zinc-900/30 dark:hover:border-teal-600/50 dark:hover:bg-teal-950/20 dark:focus-within:ring-offset-zinc-950 lg:py-7">
          <PdfIcon className="mb-3 text-zinc-400 dark:text-zinc-500" />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {uploading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Uploading…
              </span>
            ) : (
              "Drop a PDF here or click to upload"
            )}
          </span>
          <span className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Max 10 MB · PDF only
          </span>
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onUpload(f);
            }}
          />
        </label>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/80 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <aside
          className={`flex min-h-[min(24rem,50vh)] min-w-0 flex-col gap-4 rounded-2xl border border-zinc-200/90 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-none lg:max-h-[calc(100vh-7.5rem)] lg:min-h-0 lg:shrink-0 ${
            hasMatchActivity ? "order-2 lg:order-none" : ""
          }`}
        >
          <div className="flex shrink-0 flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Résumés ({resumeCountLabel})
            </h2>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                id="resume-search"
                type="search"
                autoComplete="off"
                placeholder={CV_SEARCH_FIELD_LABEL}
                aria-label={CV_SEARCH_FIELD_LABEL}
                value={resumeQuery}
                onChange={(e) => setResumeQuery(e.target.value)}
                disabled={loading || items.length === 0}
                className="w-full min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/80 py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 transition-shadow focus:border-teal-500/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-600/40 dark:focus:bg-zinc-950 dark:focus:ring-teal-500/15"
              />
            </div>
          </div>
          <div className="min-h-[12rem] min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 [scrollbar-gutter:stable] lg:min-h-0">
            {loading ? (
              <ul className="space-y-3" aria-busy="true" aria-label="Loading résumés">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/40"
                  >
                    <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                    <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                      <div className="h-4 w-3/4 max-w-[10rem] animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/80" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                <PdfIcon className="mx-auto mb-2 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No CVs yet. Upload a PDF above.
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No résumés match “{resumeQuery.trim()}”.{" "}
                  <button
                    type="button"
                    className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400 dark:decoration-teal-400/30"
                    onClick={() => setResumeQuery("")}
                  >
                    Clear search
                  </button>
                </p>
              </div>
            ) : (
              <ul className="space-y-3 pb-1">
                {filteredItems.map((cv) => {
                  const displayName = cv.gemini?.name ?? cv.originalName;
                  const isActiveMatch =
                    matchCvId === cv.id &&
                    (matchLoading || matchItems !== null);
                  return (
                  <li
                    key={cv.id}
                    className={`rounded-xl border bg-white p-3 shadow-sm transition-[box-shadow,border-color] dark:bg-zinc-950/80 ${
                      isActiveMatch
                        ? "border-teal-400/50 ring-1 ring-teal-500/25 dark:border-teal-700/50 dark:ring-teal-400/20"
                        : "border-zinc-200/90 dark:border-zinc-800"
                    }`}
                  >
                    <div className="flex gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-200 to-zinc-100 text-[0.7rem] font-bold tracking-tight text-zinc-700 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-300"
                        aria-hidden
                      >
                        {initialsFromDisplayName(displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {displayName}
                        </p>
                        {cv.gemini?.title?.trim() ? (
                          <p
                            className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-400"
                            title={cv.gemini.title}
                          >
                            {cv.gemini.title}
                          </p>
                        ) : null}
                        <p className="mt-0.5 truncate text-[0.7rem] tabular-nums text-zinc-500 dark:text-zinc-500">
                          {formatUploadDate(cv.uploadedAt)}
                        </p>
                        {cv.lowTextWarning ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Low text extracted
                          </p>
                        ) : null}
                        {cv.geminiError ? (
                          <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                            AI: {cv.geminiError}
                          </p>
                        ) : null}
                        {cv.gemini?.skills?.length ? (
                          <p
                            className="mt-1 truncate text-xs text-zinc-600 dark:text-zinc-400"
                            title={cv.gemini.skills.join(", ")}
                          >
                            {cv.gemini.skills.slice(0, 8).join(", ")}
                            {cv.gemini.skills.length > 8 ? "…" : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
                      <button
                        type="button"
                        disabled={matchLoading}
                        onClick={() => void onMatchJobs(cv.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                          matchCvId === cv.id && matchLoading
                            ? "bg-teal-800 dark:bg-teal-600"
                            : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                        }`}
                      >
                        {matchLoading && matchCvId === cv.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Spinner className="h-3.5 w-3.5" />
                            Matching…
                          </span>
                        ) : (
                          "Match"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openPreview(cv.id)}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Text
                      </button>
                      <a
                        href={`/api/cvs/${cv.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => void onDelete(cv.id)}
                        className="rounded-lg border border-red-200/90 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section
          ref={matchResultsRef}
          className={`min-h-[min(24rem,50vh)] min-w-0 lg:sticky lg:top-20 lg:min-h-[min(28rem,60vh)] lg:self-start ${
            hasMatchActivity ? "order-1 lg:order-none" : ""
          }`}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            Match report
          </h2>

          <div className="flex min-h-[min(20rem,42vh)] flex-col lg:min-h-[min(24rem,52vh)]">
          {matchLoading ? (
            <div
              className="rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white px-5 py-4 text-sm text-teal-950 shadow-sm dark:border-teal-900/50 dark:from-teal-950/35 dark:to-zinc-950 dark:text-teal-100"
              role="status"
              aria-live="polite"
            >
              <p className="flex items-center gap-2 font-semibold">
                <Spinner className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Computing matches…
              </p>
              <p className="mt-2 text-xs leading-relaxed text-teal-900/85 dark:text-teal-200/85">
                Embedding this résumé and comparing it to every job. The first
                run can take longer while job vectors are built.
              </p>
            </div>
          ) : null}

          {matchError ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/80 dark:bg-red-950/50 dark:text-red-200"
              role="alert"
            >
              {matchError}
            </p>
          ) : null}

          {matchItems !== null && matchCvId ? (
            <div className="flex min-h-0 max-h-[min(75vh,calc(100vh-9rem))] flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 shadow-sm dark:border-zinc-700/80 dark:from-zinc-950 dark:to-zinc-950/90">
              <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Ranked for
                    </p>
                    <p className="mt-0.5 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                      {activeMatchCv?.gemini?.name ??
                        activeMatchCv?.originalName}
                    </p>
                    {activeMatchCv?.gemini?.title?.trim() ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                        {activeMatchCv.gemini.title}
                      </p>
                    ) : null}
                  </div>
                  {matchLabel ? (
                    <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[0.65rem] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {matchLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[0.7rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Ordered by embedding similarity (best match first). The top
                  three scored roles include a short AI note on why each %
                  is plausible. Scroll the list below.
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
                {matchItems.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No job descriptions. Add under{" "}
                    <Link href="/job-descriptions" className="underline">
                      Jobs
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {matchItems.slice(0, 50).map((row, idx) => {
                      const rank = idx + 1;
                      const topTier = rank <= 3 && !row.skipped;
                      return (
                        <li key={row.jobDescriptionId}>
                          <div
                            className={`flex gap-3 rounded-xl border px-3 py-2.5 transition-colors dark:bg-zinc-950/40 ${
                              topTier
                                ? "border-teal-200/90 bg-teal-50/50 dark:border-teal-900/50 dark:bg-teal-950/20"
                                : "border-zinc-100 bg-white dark:border-zinc-800/90"
                            }`}
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                                topTier
                                  ? "bg-teal-600 text-white dark:bg-teal-700"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                              aria-hidden
                            >
                              {rank}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                <p
                                  className="min-w-0 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-50"
                                  title={row.title}
                                >
                                  <span className="sr-only">Rank {rank}: </span>
                                  <span className="line-clamp-2">{row.title}</span>
                                </p>
                                <span
                                  className={`shrink-0 tabular-nums text-sm font-semibold ${
                                    row.skipped
                                      ? "text-zinc-400 dark:text-zinc-500"
                                      : "text-zinc-900 dark:text-zinc-100"
                                  }`}
                                >
                                  {row.skipped ? "—" : `${row.scorePercent}%`}
                                </span>
                              </div>
                              {row.skipped ? (
                                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/90">
                                  Skipped ({row.skipReason ?? "?"})
                                </p>
                              ) : (
                                <>
                                  <div
                                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/90 dark:bg-zinc-800"
                                    role="presentation"
                                    aria-hidden
                                  >
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-teal-600 to-emerald-500 dark:from-teal-500 dark:to-emerald-400"
                                      style={{
                                        width: `${Math.min(100, Math.max(0, row.scorePercent))}%`,
                                      }}
                                    />
                                  </div>
                                  {row.justification ? (
                                    <p className="mt-2 border-l-2 border-teal-300/80 pl-2.5 text-xs leading-relaxed text-zinc-600 dark:border-teal-700/80 dark:text-zinc-400">
                                      {row.justification}
                                    </p>
                                  ) : null}
                                </>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col justify-center">
                              <Link
                                href={`/api/job-descriptions/${row.jobDescriptionId}/file`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-zinc-200 px-2 py-1 text-center text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                JD
                              </Link>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {matchItems.length > 50 ? (
                <p className="shrink-0 border-t border-zinc-100 bg-zinc-50/80 px-4 py-2 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30">
                  Showing top 50 of {matchItems.length} roles.
                </p>
              ) : null}
            </div>
          ) : !matchLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300/90 bg-gradient-to-b from-white to-zinc-50/90 px-6 py-12 text-center dark:border-zinc-700 dark:from-zinc-950/60 dark:to-zinc-950/90">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <RankedJobsIcon className="h-7 w-7" />
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Select a résumé and click{" "}
                <strong className="text-zinc-800 dark:text-zinc-200">Match</strong>{" "}
                to see roles ranked by fit. On wide layouts this panel stays in
                view beside the list.
              </p>
            </div>
          ) : null}
          </div>
        </section>
      </div>

      </div>

      <PreviewModal
        open={!!previewId}
        title={previewItem?.originalName ?? "Preview"}
        onClose={() => {
          setPreviewId(null);
          setPreviewText(null);
        }}
      >
        {previewText === null ? (
          <p className="text-sm text-zinc-500">Loading preview…</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words text-xs text-zinc-800 dark:text-zinc-200">
            {previewText}
          </pre>
        )}
      </PreviewModal>
    </div>
  );
}
