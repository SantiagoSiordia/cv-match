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
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          CVs
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Upload PDFs to{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            cvs-pdf
          </code>
          .{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            Match to jobs
          </strong>{" "}
          ranks each résumé against all job descriptions (embedding similarity,
          0–100%). On wide screens the report stays beside your list—no long
          scroll. Seed roles:{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            npm run seed:jds:50
          </code>{" "}
          or{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
            npm run seed:jds
          </code>
          .
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600 lg:py-5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {uploading ? "Uploading…" : "Drop a PDF here or click to upload"}
        </span>
        <span className="mt-1 text-xs text-zinc-500">Max 10 MB · PDF only</span>
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

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <aside
          className={`flex min-h-[min(24rem,50vh)] min-w-0 flex-col gap-3 lg:max-h-[calc(100vh-7.5rem)] lg:min-h-0 lg:shrink-0 ${
            hasMatchActivity ? "order-2 lg:order-none" : ""
          }`}
        >
          <div className="flex shrink-0 flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Résumés ({resumeCountLabel})
            </h2>
            <input
              id="resume-search"
              type="search"
              autoComplete="off"
              placeholder={CV_SEARCH_FIELD_LABEL}
              aria-label={CV_SEARCH_FIELD_LABEL}
              value={resumeQuery}
              onChange={(e) => setResumeQuery(e.target.value)}
              disabled={loading || items.length === 0}
              className="w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="min-h-[12rem] min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [scrollbar-gutter:stable] lg:min-h-0">
            {loading ? (
              <ul className="space-y-2" aria-busy="true" aria-label="Loading résumés">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="h-[5.5rem] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900/80"
                  />
                ))}
              </ul>
            ) : items.length === 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-white px-3 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                No CVs yet. Upload a PDF above.
              </p>
            ) : filteredItems.length === 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-white px-3 py-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                No résumés match “{resumeQuery.trim()}”. Clear the search to see
                all.
              </p>
            ) : (
              <ul className="space-y-2 pb-2">
                {filteredItems.map((cv) => (
                  <li
                    key={cv.id}
                    className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {cv.gemini?.name ?? cv.originalName}
                      </p>
                      {cv.gemini?.title?.trim() ? (
                        <p
                          className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300"
                          title={cv.gemini.title}
                        >
                          {cv.gemini.title}
                        </p>
                      ) : null}
                      <p className="truncate text-xs text-zinc-500">
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
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={matchLoading}
                        onClick={() => void onMatchJobs(cv.id)}
                        className={`rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-50 ${
                          matchCvId === cv.id && matchLoading
                            ? "bg-blue-800 dark:bg-blue-300 dark:text-blue-950"
                            : "bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900"
                        } hover:bg-zinc-800 dark:hover:bg-white`}
                      >
                        {matchLoading && matchCvId === cv.id
                          ? "Matching…"
                          : "Match"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openPreview(cv.id)}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Text
                      </button>
                      <a
                        href={`/api/cvs/${cv.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => void onDelete(cv.id)}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Match report
          </h2>

          <div className="flex min-h-[min(20rem,42vh)] flex-col lg:min-h-[min(24rem,52vh)]">
          {matchLoading ? (
            <div
              className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-white px-4 py-3 text-sm text-blue-950 shadow-sm dark:border-blue-900/60 dark:from-blue-950/40 dark:to-zinc-950 dark:text-blue-100"
              role="status"
              aria-live="polite"
            >
              <p className="font-medium">Computing matches…</p>
              <p className="mt-1 text-xs text-blue-800/90 dark:text-blue-200/90">
                Embedding this résumé and comparing it to every job. The first
                run can take longer while job vectors are built.
              </p>
            </div>
          ) : null}

          {matchError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
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
                    </Link>{" "}
                    or{" "}
                    <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-900">
                      npm run seed:jds:50
                    </code>
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
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-gradient-to-b from-zinc-50/90 to-white px-5 py-10 text-center dark:border-zinc-700 dark:from-zinc-900/40 dark:to-zinc-950/80">
              <p className="max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
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
