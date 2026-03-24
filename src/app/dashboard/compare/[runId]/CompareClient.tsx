"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { EvaluationRun } from "@/lib/schemas";
import type { ApiErrorBody } from "@/components/ApiTypes";

export function CompareClient() {
  const params = useParams();
  const runId = typeof params.runId === "string" ? params.runId : "";
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/evaluations/${runId}`);
        const json = (await res.json()) as
          | { ok: true; data: { run: EvaluationRun } }
          | ApiErrorBody;
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error.message);
          setRun(null);
          return;
        }
        setRun(json.data.run);
      } catch {
        if (!cancelled) setError("Could not load run");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const rows = useMemo(() => {
    if (!run) return [];
    return [...run.results].sort((a, b) => {
      const sa = a.result?.overallScore ?? -1;
      const sb = b.result?.overallScore ?? -1;
      return sb - sa;
    });
  }, [run]);

  if (!runId) {
    return (
      <p className="p-8 text-sm text-zinc-500">Missing run id in the URL.</p>
    );
  }

  if (loading) {
    return <p className="p-8 text-sm text-zinc-500">Loading…</p>;
  }

  if (error || !run) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error ?? "Run not found"}
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium underline"
        >
          All results
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Compare candidates
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {run.jobTitle ?? "Job"} ·{" "}
            {new Date(run.createdAt).toLocaleString()} ·{" "}
            <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">
              {run.id}
            </code>
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
        >
          All results
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-3">Candidate</th>
              <th className="px-3 py-3">Overall</th>
              <th className="px-3 py-3">Skills</th>
              <th className="px-3 py-3">Experience</th>
              <th className="px-3 py-3">Education</th>
              <th className="px-3 py-3">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr
                key={row.cvId}
                className="align-top hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
              >
                <td className="px-3 py-3">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {row.cvOriginalName}
                  </p>
                  {row.error ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {row.error}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                  {row.result?.overallScore ?? "—"}
                </td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                  {row.result?.skillsMatch ?? "—"}
                </td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                  {row.result?.experienceRelevance ?? "—"}
                </td>
                <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                  {row.result?.educationFit ?? "—"}
                </td>
                <td className="max-w-xs px-3 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                  {row.result ? (
                    <details>
                      <summary className="cursor-pointer font-medium text-zinc-800 dark:text-zinc-200">
                        View
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap">
                        {row.result.summary}
                      </p>
                      {row.result.strengths.length ? (
                        <p className="mt-2">
                          <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                            Strengths:{" "}
                          </span>
                          {row.result.strengths.join("; ")}
                        </p>
                      ) : null}
                      {row.result.gaps.length ? (
                        <p className="mt-2">
                          <span className="font-semibold text-amber-800 dark:text-amber-300">
                            Gaps:{" "}
                          </span>
                          {row.result.gaps.join("; ")}
                        </p>
                      ) : null}
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
