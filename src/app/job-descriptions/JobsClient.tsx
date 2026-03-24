"use client";

import { useCallback, useEffect, useState } from "react";
import type { JobStoredMeta } from "@/lib/schemas";
import type { ApiErrorBody, ApiJobList } from "@/components/ApiTypes";
import { PreviewModal } from "@/components/PreviewModal";

export function JobsClient() {
  const [items, setItems] = useState<JobStoredMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

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

  async function onUpload(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/job-descriptions", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as
        | { ok: true; data: { item: JobStoredMeta } }
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

  async function onDelete(id: string) {
    if (!confirm("Delete this job description?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/job-descriptions/${id}`, {
        method: "DELETE",
      });
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Job descriptions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Upload a PDF or plain-text file, or paste text below. We extract text
          and infer a short title when possible.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {uploading ? "Uploading…" : "Drop PDF or .txt here or click to upload"}
        </span>
        <span className="mt-1 text-xs text-zinc-500">Max 10 MB</span>
        <input
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onUpload(f);
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

      <div className="mt-10">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No job descriptions yet. Upload or paste one above.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                    {job.titleGuess ?? job.originalName}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {job.originalName} · {job.mimeType} ·{" "}
                    {new Date(job.uploadedAt).toLocaleString()}
                  </p>
                  {job.lowTextWarning ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Low extracted text — check the source file.
                    </p>
                  ) : null}
                  {job.geminiError ? (
                    <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                      AI title: {job.geminiError}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openPreview(job.id)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Preview text
                  </button>
                  <a
                    href={`/api/job-descriptions/${job.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Open file
                  </a>
                  <button
                    type="button"
                    onClick={() => void onDelete(job.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
