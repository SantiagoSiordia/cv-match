"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CvStoredMeta } from "@/lib/schemas";
import type {
  ApiBulkFileError,
  ApiCvList,
  ApiErrorBody,
} from "@/components/ApiTypes";
import {
  CV_SEARCH_FIELD_LABEL,
  cvMatchesSearchQuery,
} from "@/lib/cvSearchFilter";
import { PreviewModal } from "@/components/PreviewModal";

function pdfFilesOnly(list: FileList | File[]): File[] {
  return Array.from(list).filter(
    (f) =>
      f.type === "application/pdf" ||
      f.name.toLowerCase().endsWith(".pdf"),
  );
}

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
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [resumeQuery, setResumeQuery] = useState("");

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

  async function onUploadCvsFiles(source: FileList | File[] | null) {
    if (!source || (source instanceof FileList ? source.length === 0 : source.length === 0)) {
      return;
    }
    const rawLen = source instanceof FileList ? source.length : source.length;
    const files = pdfFilesOnly(source);
    if (files.length === 0) {
      setUploadNotice(null);
      setError(
        rawLen > 0
          ? "Only PDF files are supported. Non-PDF files were not uploaded."
          : "Select at least one PDF.",
      );
      return;
    }
    const skippedNonPdf = rawLen - files.length;

    setUploading(true);
    setError(null);
    setUploadNotice(null);
    const fd = new FormData();
    for (const f of files) {
      fd.append("files", f);
    }
    try {
      const res = await fetch("/api/cvs", { method: "POST", body: fd });
      const json = (await res.json()) as
        | { ok: true; data: { item: CvStoredMeta } }
        | {
            ok: true;
            data: { items: CvStoredMeta[]; errors: ApiBulkFileError[] };
          }
        | ApiErrorBody;
      if (!json.ok) {
        setError(json.error.message);
        return;
      }

      const { data } = json;
      const noticeParts: string[] = [];
      if (skippedNonPdf > 0) {
        noticeParts.push(
          `${skippedNonPdf} non-PDF file${skippedNonPdf === 1 ? "" : "s"} skipped.`,
        );
      }

      if ("item" in data) {
        if (noticeParts.length) {
          setUploadNotice(`${noticeParts.join(" ")} Uploaded 1 résumé.`);
        }
      } else {
        const { items, errors } = data;
        noticeParts.push(`Uploaded ${items.length} résumé(s).`);
        if (errors.length > 0) {
          noticeParts.push(
            `Failed: ${errors.map((e) => `${e.fileName}: ${e.message}`).join("; ")}`,
          );
        }
        setUploadNotice(noticeParts.join(" "));
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
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          Library
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          CVs
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400 sm:mx-0">
          PDFs are stored under{" "}
          <code className="rounded-md bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[0.8rem] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            cvs-pdf
          </code>
          . Add job descriptions under{" "}
          <Link
            href="/job-descriptions"
            className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400 dark:decoration-teal-400/30"
          >
            Jobs
          </Link>
          , then use{" "}
          <Link
            href="/analytics"
            className="font-medium text-teal-700 underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400 dark:decoration-teal-400/30"
          >
            Analytics
          </Link>{" "}
          for embedding views and bulk scoring.
        </p>
      </header>

      <div className="rounded-2xl border border-zinc-200/90 bg-white p-1 shadow-md shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-none">
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-8 transition-colors hover:border-teal-400/60 hover:bg-teal-50/40 focus-within:outline-none focus-within:ring-2 focus-within:ring-teal-500/30 focus-within:ring-offset-2 focus-within:ring-offset-white dark:border-zinc-700 dark:bg-zinc-900/30 dark:hover:border-teal-600/50 dark:hover:bg-teal-950/20 dark:focus-within:ring-offset-zinc-950 lg:py-7"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (uploading) return;
            void onUploadCvsFiles(e.dataTransfer.files);
          }}
        >
          <PdfIcon className="mb-3 text-zinc-400 dark:text-zinc-500" />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {uploading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                Uploading…
              </span>
            ) : (
              "Drop PDFs here or click to select one or more"
            )}
          </span>
          <span className="mt-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Max 10 MB per file · PDF only · bulk upload supported
          </span>
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const list = e.target.files;
              e.target.value = "";
              void onUploadCvsFiles(list);
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
      {uploadNotice ? (
        <p
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          {uploadNotice}
        </p>
      ) : null}

      <section
        className="mt-8 flex flex-col gap-5 rounded-2xl border border-zinc-200/90 bg-white/95 p-5 shadow-md shadow-zinc-900/5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-none sm:p-6"
        aria-labelledby="resume-list-heading"
      >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2
              id="resume-list-heading"
              className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400"
            >
              Your files ({resumeCountLabel})
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
                className="w-full min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/80 py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 transition-shadow focus:border-teal-500/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-teal-600/40 dark:focus:bg-zinc-950 dark:focus:ring-teal-500/15 sm:max-w-xs"
              />
            </div>
          </div>
          <div className="min-w-0">
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
              <ul className="grid grid-cols-1 gap-3 pb-1 lg:grid-cols-2">
                {filteredItems.map((cv) => {
                  const displayName =
                    cv.gemini?.name?.trim() ||
                    cv.originalName.replace(/\.[^.]+$/, "").trim() ||
                    cv.originalName;
                  return (
                  <li
                    key={cv.id}
                    className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/80 dark:hover:border-zinc-700"
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
                        <p className="mt-0.5 truncate text-[0.7rem] tabular-nums text-zinc-500 dark:text-zinc-500">
                          {formatUploadDate(cv.uploadedAt)}
                        </p>
                        {cv.gemini ? (
                          <dl className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-500">
                                Location
                              </dt>
                              <dd className="min-w-0 truncate">
                                {cv.gemini.location?.trim() || "—"}
                              </dd>
                            </div>
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-500">
                                Position
                              </dt>
                              <dd className="min-w-0 truncate">
                                {cv.gemini.currentPosition?.trim() || "—"}
                              </dd>
                            </div>
                            <div className="flex gap-1.5">
                              <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-500">
                                Skills
                              </dt>
                              <dd
                                className="min-w-0 truncate"
                                title={
                                  cv.gemini.hardSkills?.length
                                    ? cv.gemini.hardSkills.join(", ")
                                    : undefined
                                }
                              >
                                {cv.gemini.hardSkills?.length
                                  ? cv.gemini.hardSkills.join(", ")
                                  : "—"}
                              </dd>
                            </div>
                          </dl>
                        ) : null}
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
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => void openPreview(cv.id)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Extracted text
                      </button>
                      <a
                        href={`/api/cvs/${cv.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Open PDF
                      </a>
                      <button
                        type="button"
                        onClick={() => void onDelete(cv.id)}
                        className="rounded-lg border border-red-200/90 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/40"
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
