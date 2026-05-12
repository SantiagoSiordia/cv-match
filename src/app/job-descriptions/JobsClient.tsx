"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { JobStoredMeta } from "@/lib/schemas";
import type {
  ApiBulkFileError,
  ApiErrorBody,
  ApiJobList,
} from "@/components/ApiTypes";
import { PreviewModal } from "@/components/PreviewModal";
import {
  JOB_SEARCH_FIELD_LABEL,
  jobMatchesSearchQuery,
} from "@/lib/jobSearchFilter";

/** UTC date + time — avoids server/client locale mismatches from `toLocaleString()`. */
function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${min} UTC`;
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

export function JobsClient() {
  const [items, setItems] = useState<JobStoredMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/job-descriptions");
      const json = (await res.json()) as
        | { ok: true; data: ApiJobList }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setItems(json.data.items);
    } catch {
      setError("Could not load job descriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUploadJobFiles(source: FileList | File[] | null) {
    if (!source || (source instanceof FileList ? source.length === 0 : source.length === 0)) {
      return;
    }
    const files = Array.from(source);

    setUploading(true);
    setError(null);
    setUploadNotice(null);
    const fd = new FormData();
    for (const f of files) {
      fd.append("files", f);
    }
    try {
      const res = await fetch("/api/job-descriptions", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as
        | { ok: true; data: { item: JobStoredMeta } }
        | {
            ok: true;
            data: { items: JobStoredMeta[]; errors: ApiBulkFileError[] };
          }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }

      const { data } = json;
      if ("item" in data) {
        /* single PDF/txt job: no banner */
      } else {
        const { items, errors } = data;
        const parts: string[] = [`Uploaded ${items.length} job description(s).`];
        if (errors.length > 0) {
          parts.push(
            `Failed: ${errors.map((e) => `${e.fileName}: ${e.message}`).join("; ")}`,
          );
        }
        setUploadNotice(parts.join(" "));
      }

      await load();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onCreateText(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Enter job description text");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/job-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Job description",
          text: body.trim(),
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { item: JobStoredMeta } }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }
      setBody("");
      setTitle("");
      await load();
    } catch {
      setError("Could not save text");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string): Promise<boolean> {
    if (!confirm("Delete this job description?")) return false;
    setError(null);
    try {
      const res = await fetch(`/api/job-descriptions/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok: true } | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Delete failed");
      return false;
    }
  }

  async function deleteFromPreviewModal() {
    if (!previewId) return;
    const ok = await onDelete(previewId);
    if (ok) {
      setPreviewId(null);
      setPreviewText(null);
    }
  }

  async function openPreview(id: string) {
    setPreviewId(id);
    setPreviewText(null);
    try {
      const res = await fetch(`/api/job-descriptions/${id}`);
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

  const filteredItems = useMemo(
    () => items.filter((job) => jobMatchesSearchQuery(job, jobSearchQuery)),
    [items, jobSearchQuery],
  );

  const listSummary = useMemo(() => {
    if (items.length === 0) return null;
    const q = jobSearchQuery.trim();
    return q.length > 0
      ? `${filteredItems.length} of ${items.length} shown`
      : `${items.length} job description${items.length === 1 ? "" : "s"}`;
  }, [filteredItems.length, items.length, jobSearchQuery]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Job descriptions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Upload PDFs, <code className="text-xs">.txt</code>, or a requirements{" "}
          <code className="text-xs">.csv</code> (one job per row). Bulk PDF/txt
          supported. For CSV we store every column and build text for matching.
          We infer a short title from PDF/txt when possible.
        </p>
        <p className="mt-4 max-w-2xl rounded-xl border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950 dark:border-sky-800/80 dark:bg-sky-950/35 dark:text-sky-100">
          Need a report for{" "}
          <span className="font-medium">every role</span> at once — best text
          matches, AI scores where you have run reviews, and a CSV export? Open{" "}
          <Link
            href="/analytics"
            className="font-semibold text-sky-800 underline decoration-sky-400/80 underline-offset-2 hover:text-sky-950 dark:text-sky-200 dark:hover:text-white"
          >
            Analytics
          </Link>
          .
        </p>
      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (uploading) return;
          void onUploadJobFiles(e.dataTransfer.files);
        }}
      >
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {uploading
            ? "Uploading…"
            : "Drop files here or click to select multiple (PDF, .txt, .csv)"}
        </span>
        <span className="mt-1 text-center text-xs text-zinc-500">
          Max 10 MB per file · CSV creates one job per data row
        </span>
        <input
          type="file"
          accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const input = e.target;
            const picked = input.files ? Array.from(input.files) : [];
            input.value = "";
            void onUploadJobFiles(picked);
          }}
        />
      </label>

      <form
        onSubmit={onCreateText}
        className="mt-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Or paste a job description
        </p>
        <input
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="min-h-[140px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          placeholder="Paste the full job description…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {creating ? "Saving…" : "Save as text"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {uploadNotice ? (
        <p
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          {uploadNotice}
        </p>
      ) : null}

      <div className="mt-10">
        {loading ? (
          <div
            className="w-full space-y-3"
            aria-busy="true"
            aria-label="Loading job descriptions"
          >
            <div className="mb-2 h-3 w-44 max-w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="relative mb-4">
              <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-700" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-2.5 dark:border-zinc-800/80 dark:bg-zinc-900/40"
              >
                <div className="space-y-2 pt-0.5">
                  <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-3 w-full max-w-lg animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No job descriptions yet. Upload or paste one above.
          </p>
        ) : (
          <>
            {listSummary ? (
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                {listSummary}
              </p>
            ) : null}
            <div className="relative mb-4">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
                <SearchIcon className="size-4" />
              </span>
              <input
                type="search"
                autoComplete="off"
                placeholder={JOB_SEARCH_FIELD_LABEL}
                aria-label={JOB_SEARCH_FIELD_LABEL}
                title="Searches file name, inferred title, MIME type, upload date, and extracted text"
                value={jobSearchQuery}
                onChange={(e) => setJobSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500/25"
              />
            </div>
            {filteredItems.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                No job descriptions match “{jobSearchQuery.trim()}”. Clear the
                search to see all.
              </p>
            ) : (
          <ul className="space-y-2">
            {filteredItems.map((job) => {
              const headline = job.titleGuess ?? job.originalName;
              return (
                <li
                  key={job.id}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-col sm:flex-row sm:items-stretch">
                    <button
                      type="button"
                      onClick={() => void openPreview(job.id)}
                      className="min-w-0 flex-1 p-2.5 text-left transition-colors hover:bg-zinc-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:hover:bg-zinc-900/50 dark:focus-visible:outline-zinc-500"
                      aria-label={`Open extracted text preview for ${headline}`}
                    >
                      <p className="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
                        {headline}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-500">
                        {job.originalName} · {job.mimeType} ·{" "}
                        {formatUploadedAt(job.uploadedAt)}
                      </p>
                      {job.lowTextWarning ? (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                          Low extracted text
                        </p>
                      ) : null}
                      {job.extractedError ? (
                        <p className="mt-1 line-clamp-2 text-[11px] text-red-700 dark:text-red-300">
                          AI title: {job.extractedError}
                        </p>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center border-t border-zinc-100 px-2 py-2 sm:border-l sm:border-t-0 dark:border-zinc-800">
                      <Link
                        href={`/job-descriptions/${job.id}`}
                        className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:w-auto sm:py-1.5"
                      >
                        Compare profiles
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
            )}
          </>
        )}
      </div>

      <PreviewModal
        open={!!previewId}
        title={previewItem?.originalName ?? "Preview"}
        onClose={() => {
          setPreviewId(null);
          setPreviewText(null);
        }}
        footer={
          previewId ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <a
                href={`/api/job-descriptions/${previewId}/file`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Open file
              </a>
              <Link
                href={`/job-descriptions/${previewId}`}
                className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                onClick={() => {
                  setPreviewId(null);
                  setPreviewText(null);
                }}
              >
                Compare profiles
              </Link>
              <button
                type="button"
                onClick={() => void deleteFromPreviewModal()}
                className="inline-flex items-center justify-center rounded-lg border border-red-200/90 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
              >
                Delete
              </button>
            </div>
          ) : null
        }
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
