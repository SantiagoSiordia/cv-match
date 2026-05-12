"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiErrorBody, ApiJobEmbeddingRank } from "@/components/ApiTypes";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countInsensitive(haystack: string, needle: string): number {
  const n = needle.trim();
  if (!n) return 0;
  const lowerH = haystack.toLowerCase();
  const lowerN = n.toLowerCase();
  let count = 0;
  let i = 0;
  while (i <= lowerH.length - lowerN.length) {
    const j = lowerH.indexOf(lowerN, i);
    if (j === -1) break;
    count++;
    i = j + lowerN.length;
  }
  return count;
}

function HighlightedPre({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const q = query.trim();
  if (!q) {
    return (
      <pre
        className={`whitespace-pre-wrap break-words font-mono text-xs text-zinc-800 dark:text-zinc-200 ${className ?? ""}`}
      >
        {text}
      </pre>
    );
  }
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <pre
      className={`whitespace-pre-wrap break-words font-mono text-xs text-zinc-800 dark:text-zinc-200 ${className ?? ""}`}
    >
      {parts.map((part, i) => {
        const isHit = part.toLowerCase() === q.toLowerCase();
        if (!isHit) return part;
        return (
          <mark
            key={i}
            className="rounded-sm bg-amber-200/90 px-0.5 text-zinc-900 dark:bg-amber-700/50 dark:text-zinc-50"
          >
            {part}
          </mark>
        );
      })}
    </pre>
  );
}

type JobExtractedResponse = {
  item: unknown;
  extracted: string;
};

function safePdfFilenameBase(title: string): string {
  const base = title
    .replace(/\.[^.]+$/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
    .trim();
  return base.length ? base : "job-comparison";
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

export function JobRoleDetailClient({
  jobDescriptionId,
}: {
  jobDescriptionId: string;
}) {
  const [rankPayload, setRankPayload] = useState<ApiJobEmbeddingRank | null>(null);
  const [jdText, setJdText] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumeQuery, setResumeQuery] = useState("");
  const [manualFindQuery, setManualFindQuery] = useState("");
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [cvFullText, setCvFullText] = useState<string | null>(null);
  const [cvLoadState, setCvLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [cvLoadError, setCvLoadError] = useState<string | null>(null);
  const [pdfDownloadLoading, setPdfDownloadLoading] = useState(false);
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rankRes, jdRes] = await Promise.all([
        fetch(`/api/job-descriptions/${jobDescriptionId}/embedding-rank`),
        fetch(`/api/job-descriptions/${jobDescriptionId}?fullExtracted=1`),
      ]);
      const rankJson = (await rankRes.json()) as
        | { ok: true; data: ApiJobEmbeddingRank }
        | ApiErrorBody;
      const jdJson = (await jdRes.json()) as
        | { ok: true; data: JobExtractedResponse }
        | ApiErrorBody;

      if (!rankJson.ok) {
        setError(rankJson.error.message);
        return;
      }
      if (!jdJson.ok) {
        setError(jdJson.error.message);
        return;
      }
      setRankPayload(rankJson.data);
      setJdText(jdJson.data.extracted ?? "");
    } catch {
      setError("Could not load job comparison data");
    } finally {
      setLoading(false);
    }
  }, [jobDescriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rankedWithIndex = useMemo(() => {
    if (!rankPayload) return [];
    return rankPayload.matches.map((m, i) => ({
      row: m,
      displayRank: i + 1,
    }));
  }, [rankPayload]);

  const filteredRows = useMemo(() => {
    const q = resumeQuery.trim().toLowerCase();
    if (!q) return rankedWithIndex;
    return rankedWithIndex.filter(
      ({ row }) =>
        row.cvOriginalName.toLowerCase().includes(q) ||
        row.cvId.toLowerCase().includes(q),
    );
  }, [rankedWithIndex, resumeQuery]);

  const jdFindCount = useMemo(
    () => countInsensitive(jdText, manualFindQuery),
    [jdText, manualFindQuery],
  );
  const cvFindCount = useMemo(
    () => countInsensitive(cvFullText ?? "", manualFindQuery),
    [cvFullText, manualFindQuery],
  );

  async function loadCvFullText(cvId: string) {
    setSelectedCvId(cvId);
    setCvLoadState("loading");
    setCvLoadError(null);
    setCvFullText(null);
    try {
      const res = await fetch(`/api/cvs/${cvId}?fullExtracted=1`);
      const json = (await res.json()) as
        | { ok: true; data: { extracted: string } }
        | ApiErrorBody;
      if (!json.ok) {
        setCvLoadState("error");
        setCvLoadError(json.error.message);
        return;
      }
      setCvFullText(json.data.extracted ?? "");
      setCvLoadState("idle");
    } catch {
      setCvLoadState("error");
      setCvLoadError("Could not load résumé text");
    }
  }

  async function downloadComparisonPdf() {
    setPdfDownloadError(null);
    setPdfDownloadLoading(true);
    const url = `/api/job-descriptions/${jobDescriptionId}/comparison-report`;
    const title = rankPayload?.jobTitle ?? "job";
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
      let filename = `${safePdfFilenameBase(title)}.pdf`;
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Loading job role and profile comparison…
      </div>
    );
  }

  if (error || !rankPayload) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "No data"}
        </p>
        <Link
          href="/job-descriptions"
          className="mt-4 inline-block text-sm font-medium text-teal-700 underline dark:text-teal-400"
        >
          Back to jobs
        </Link>
      </div>
    );
  }

  const { meta, jobRequiresTechnicalOrdering, jobTitle } = rankPayload;
  const jobFileHref = `/api/job-descriptions/${jobDescriptionId}/file`;

  return (
    <div className="mx-auto min-w-0 max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Job role
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {jobTitle}
          </h1>
          <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            {jobDescriptionId}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Compare every résumé in the library to this role using the same embedding
            rank as Analytics. Search and manual find help you sanity-check scores; the
            PDF report lists the full ranked table plus a job description excerpt.
          </p>
        </div>
        <div className="flex min-w-0 shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {pdfDownloadError ? (
            <p className="max-w-sm rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {pdfDownloadError}
            </p>
          ) : null}
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={pdfDownloadLoading}
            aria-busy={pdfDownloadLoading}
            onClick={() => void downloadComparisonPdf()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            {pdfDownloadLoading ? (
              <>
                <PdfDownloadSpinner className="size-4 shrink-0 text-white" />
                Building PDF…
              </>
            ) : (
              "Download PDF report"
            )}
          </button>
          <a
            href={jobFileHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Open job file
          </a>
          <Link
            href="/job-descriptions"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            All jobs
          </Link>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
        <span className="font-medium">Embedding model:</span>{" "}
        <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">
          {meta.embeddingModelId}
        </code>
        {" · "}
        <span className="font-medium">Index key:</span>{" "}
        <code className="max-w-[12rem] truncate rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">
          {meta.embeddingIndexModelKey}
        </code>
        {" · "}
        <span className="font-medium">Max chars / side:</span> {meta.maxEmbeddingChars}
        {meta.jobQueryInputTruncated ? (
          <span className="ml-2 font-medium text-amber-800 dark:text-amber-200">
            Job query text was truncated for embedding.
          </span>
        ) : null}
        {jobRequiresTechnicalOrdering ? (
          <span className="ml-2 font-medium text-sky-800 dark:text-sky-200">
            Technical-role ordering applies (non-technical tier after technical).
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Job — full extracted text
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              JD find matches:{" "}
              <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                {jdFindCount}
              </span>
            </p>
          </div>
          <div className="max-h-[min(70vh,32rem)] min-h-[12rem] overflow-auto p-3">
            <HighlightedPre text={jdText} query={manualFindQuery} />
          </div>
        </section>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Search résumés (filename)
            </label>
            <input
              type="search"
              value={resumeQuery}
              onChange={(e) => setResumeQuery(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Filter by file name…"
              autoComplete="off"
            />
            <label className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Manual find in job + loaded résumé (case-insensitive)
            </label>
            <input
              type="search"
              value={manualFindQuery}
              onChange={(e) => setManualFindQuery(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="e.g. Python, AWS, Node…"
              autoComplete="off"
            />
          </div>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                All profiles vs this role ({filteredRows.length} shown)
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-900">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                      #
                    </th>
                    <th className="px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                      %
                    </th>
                    <th className="px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                      cos
                    </th>
                    <th className="px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                      Tier
                    </th>
                    <th className="px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                      Résumé
                    </th>
                    <th className="px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
                      PDF
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(({ row, displayRank }) => {
                    const selected = selectedCvId === row.cvId;
                    return (
                      <tr
                        key={row.cvId}
                        className={`cursor-pointer border-b border-zinc-100 dark:border-zinc-800/80 ${
                          selected
                            ? "bg-teal-50/80 dark:bg-teal-950/30"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                        }`}
                        onClick={() => {
                          setSelectedCvId(row.cvId);
                          setCvFullText(null);
                          setCvLoadState("idle");
                          setCvLoadError(null);
                        }}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                          {displayRank}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                          {row.skipped ? "—" : `${row.scorePercent}`}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                          {row.skipped ? "—" : row.cosineSimilarity.toFixed(4)}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-400">
                          {row.technicalBucket ?? "—"}
                          {row.skipped && row.skipReason ? (
                            <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                              {row.skipReason}
                            </span>
                          ) : null}
                          {row.cvBodyTruncatedForEmbed ? (
                            <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                              body &gt; {meta.maxEmbeddingChars} chars for embed
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[14rem] px-2 py-1.5">
                          <span className="line-clamp-2 font-medium text-zinc-900 dark:text-zinc-100">
                            {row.cvOriginalName}
                          </span>
                          {row.cvDocumentTitleLine ? (
                            <span className="mt-0.5 block truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                              title line: {row.cvDocumentTitleLine}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <a
                            href={`/api/cvs/${row.cvId}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-teal-700 underline dark:text-teal-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Selected résumé — full extracted text
              </h2>
              <button
                type="button"
                disabled={!selectedCvId || cvLoadState === "loading"}
                onClick={() => selectedCvId && void loadCvFullText(selectedCvId)}
                className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {cvLoadState === "loading" ? "Loading…" : "Load full text"}
              </button>
            </div>
            <p className="border-b border-zinc-100 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              CV find matches:{" "}
              <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                {cvFindCount}
              </span>
              {selectedCvId ? (
                <span className="ml-2 truncate font-mono text-[10px] text-zinc-400">
                  {selectedCvId}
                </span>
              ) : null}
            </p>
            <div className="max-h-[min(50vh,24rem)] min-h-[8rem] overflow-auto p-3">
              {!selectedCvId ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Select a row in the table, then load full text.
                </p>
              ) : cvLoadState === "loading" ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
              ) : cvLoadError ? (
                <p className="text-sm text-red-700 dark:text-red-300">{cvLoadError}</p>
              ) : cvFullText === null ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Click &quot;Load full text&quot; to fetch extracted text for manual search.
                </p>
              ) : (
                <HighlightedPre text={cvFullText} query={manualFindQuery} />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
