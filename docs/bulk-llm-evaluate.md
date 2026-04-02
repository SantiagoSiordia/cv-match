# Bulk LLM evaluate (top K)

This document describes how **Bulk LLM evaluate top K** works in the Analytics UI: how jobs and CVs are chosen, how the LLM is invoked, and where that logic lives in the codebase.

## Purpose

For every job description that has extractable text, the app:

1. Ranks all CVs by **embedding similarity** (cheap, vector-based).
2. Keeps only the **top K** matches (and optionally drops matches below an **embedding floor**).
3. Runs the same **LLM compatibility evaluation** used on the Evaluate page for that short list of CVs.
4. **Saves one evaluation run per job** (same storage model as a manual evaluate).

So bulk mode automates “for each job, evaluate the K most similar CVs and persist the run.”

## API surface

| Route | Role |
| --- | --- |
| `POST /api/analytics/bulk-evaluate-top-k/stream` | Streaming NDJSON progress (used by Analytics). |
| `POST /api/analytics/bulk-evaluate-top-k` | Same work in one shot (no per-job stream). |

Request body (both):

- `k` — integer 1–20, default `5`: max CVs per job after ranking.
- `embeddingFloorPercent` — 0–100, default `0`: minimum embedding match score (percent) to count as a candidate.

## Step 1: Build the job × CV matrix (embeddings)

Implementation: `buildJobCvMatrix()` in `src/lib/embeddings.ts`.

Roughly:

1. Ensure CV and job embedding indexes exist; list all jobs and CVs.
2. For each job with non-empty extracted text, include it in a batch.
3. **Batch-embed** all those job texts as retrieval queries.
4. For each job, compare its vector to every CV with text (cosine similarity), sort by score, and attach metadata (e.g. skip reasons for empty text or dimension mismatches).

The result is a **matrix**: one row per job, each row an ordered list of CV matches with `scorePercent`, `skipped`, etc.

No LLM compatibility call happens in this step—only embeddings and math.

## Step 2: Iterate jobs and pick top K

Implementation: `src/app/api/analytics/bulk-evaluate-top-k/stream/route.ts` (and the non-stream route with the same loop).

For each matrix row:

1. **Filter** matches: not skipped, `scorePercent >= embeddingFloorPercent`.
2. **Take** at most `k` CVs: `slice(0, k)`.
3. If the list is empty → record **skipped** (e.g. `no_candidates_above_floor`) and continue.
4. Otherwise call `runEvaluation({ jobDescriptionId, cvIds })`.

The stream endpoint emits events: `matrix` → `ready` (job list + total) → per-`job` updates (`running` / `done` / `error` / `skipped`) → `complete` with `runs` and `skipped`.

Jobs are processed **sequentially** (one job finishes before the next starts).

## Step 3: One evaluation run per job (`runEvaluation`)

Implementation: `runEvaluation` in `src/lib/evaluateRun.ts`.

For a single job and list of CV IDs:

1. Load job metadata and **job text** once (`getJobMeta`, `readJobExtractedText`). Missing job or text throws `EvaluateError`.
2. For **each CV ID in order** (sequential loop):
   - Load CV metadata and **CV text** (`getCvMeta`, `readCvExtractedText`).
   - If CV missing or no text → record a row error, continue.
   - Else call **`evaluateCompatibilityWithProvider(jobText, cvText)`** — the actual **LLM** compatibility call (`src/lib/aiProvider` / Bedrock path).
3. **`saveEvaluationRun`** persists one run with all per-CV results.

So **LLM calls are also sequential within a job**: CV 1, then CV 2, … up to K.

## Cost and throughput (mental model)

- **Embedding work**: dominated by building the matrix (batch job embeddings + per-job × all-CV scoring in memory).
- **LLM work**: roughly `(jobs with at least one candidate) × (≤ K)` calls, **all serialized** in the current design.

## Related UI copy

Analytics client: `src/app/analytics/AnalyticsClient.tsx` — button **“Bulk LLM evaluate top K”** and NDJSON stream handling for progress.
