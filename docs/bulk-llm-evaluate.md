# Bulk LLM evaluate (top K)

This document describes how **Bulk LLM evaluate top K** works in the Analytics UI: how jobs and CVs are chosen, how the LLM is invoked, and where that logic lives in the codebase.

## Purpose

For every job description that has extractable text, the app:

1. Ranks all CVs by **embedding similarity** (cheap, vector-based).
2. Keeps only the **top K** matches (and optionally drops matches below an **embedding floor**).
3. Runs the same **LLM compatibility evaluation** used on the Evaluate page for that short list of CVs (unless **batch** mode is enabled — see below).
4. **Saves one evaluation run per job** (same storage model as a manual evaluate).

So bulk mode automates “for each job, evaluate the K most similar CVs and persist the run.”

## API surface

| Route | Role |
| --- | --- |
| `POST /api/analytics/bulk-evaluate-top-k/stream` | Streaming NDJSON progress (used by Analytics). |
| `POST /api/analytics/bulk-evaluate-top-k` | Same work in one shot (no per-job stream). |

Request body (both), validated by `bulkEvaluateTopKBodySchema` in `src/lib/bulkEvaluateTopKSchema.ts`:

| Field | Default | Meaning |
| --- | --- | --- |
| `k` | `5` | Integer 1–20: max CVs per job after ranking. |
| `embeddingFloorPercent` | `0` | Minimum embedding match score (percent) to count as a candidate. |
| `skipIfUnchanged` | `false` | If `true`, skip a job when the **latest saved evaluation run** for that job already has the **same ordered** `cvId` list as the current top‑K selection (`unchanged_since_last_run`). |
| `useBatchedCompatibility` | `false` | If `true`, one LLM request per job containing all K résumés; if `false`, up to `EVALUATE_CV_CONCURRENCY` parallel per‑CV calls (subject to `BULK_LLM_GLOBAL_CONCURRENCY`). |

The stream `complete` event includes `skipIfUnchanged` and `useBatchedCompatibility` for the client. Skips with `unchanged_since_last_run` may include `existingRunId` on `job` events.

## Step 1: Build the job × CV matrix (embeddings)

Implementation: `buildJobCvMatrix()` in `src/lib/embeddings.ts`.

Roughly:

1. Ensure CV and job embedding indexes exist; list all jobs and CVs.
2. For each job with non-empty extracted text, include it in a batch.
3. **Batch-embed** all those job texts as retrieval queries.
4. For each job, compare its vector to every CV with text (cosine similarity), sort by score, and attach metadata (e.g. skip reasons for empty text or dimension mismatches).

The result is a **matrix**: one row per job, each row an ordered list of CV matches with `scorePercent`, `skipped`, etc.

No LLM compatibility call happens in this step—only embeddings and math.

With `EVALUATE_LOG_TIMING=1`, the stream route logs a JSON line `bulk_eval` / `matrix_built` with duration and job count.

## Step 2: Jobs in parallel, top K per row

Implementation: `src/app/api/analytics/bulk-evaluate-top-k/stream/route.ts` and `src/app/api/analytics/bulk-evaluate-top-k/route.ts`.

Matrix rows are processed with **`mapWithConcurrency`** (`src/lib/concurrencyPool.ts`) and **`resolveBulkJobConcurrency()`** (default **2**, env **`BULK_JOB_CONCURRENCY`**, max 16).

For each row:

1. **Filter** matches: not skipped, `scorePercent >= embeddingFloorPercent`.
2. **Take** at most `k` CVs: `slice(0, k)`.
3. If the list is empty → **skipped** (`no_candidates_above_floor`).
4. If `skipIfUnchanged` and `runMatchesOrderedCvIds(latestRun, cvIds)` → **skipped** (`unchanged_since_last_run`), with `existingRunId` in the stream.
5. Otherwise **`runEvaluation({ jobDescriptionId, cvIds }, options)`** with bulk options: `useGlobalLlmSlot: true`, `useBatchedCompatibility` from the body.

The stream emits: `matrix` → `ready` → per-`job` events → `complete`.

## Step 3: One evaluation run per job (`runEvaluation`)

Implementation: `runEvaluation` / `evaluateJobAndCvs` in `src/lib/evaluateRun.ts`.

Shared steps:

1. Load job metadata and **job text** once. Missing job or text throws `EvaluateError`.
2. **Prepare** all CV rows in parallel (`getCvMeta`, `readCvExtractedText` per id).
3. Either:
   - **Batch mode** (`useBatchedCompatibility`): one **`evaluateCompatibilityBatchWithProvider`** call (Bedrock or Gemini; see `src/lib/aiProvider.ts`, `bedrock.ts`, `gemini.ts`), optionally wrapped in the **global bulk semaphore** and **`withLlmThrottleRetries`**.
   - **Parallel per-CV mode**: up to **`EVALUATE_CV_CONCURRENCY`** (default 3, max 20) concurrent **`evaluateCompatibilityWithProvider`** calls, each wrapped with throttle retries and the global semaphore when enabled.
4. **`saveEvaluationRun`** persists one run with results in **input `cvIds` order**.

Interactive evaluate (`POST /api/evaluate`) does **not** set bulk options, so it uses parallel per‑CV mode with default concurrency but **no** global bulk slot pool.

### Global LLM cap (bulk only)

`getBulkLlmGlobalSemaphore()` in `src/lib/bulkLlmGlobalPool.ts` reads **`BULK_LLM_GLOBAL_CONCURRENCY`** (default **4**, max 64). Set to **`0`** to disable global limiting. Each in-flight compatibility call (single or batch) acquires **one** slot while running.

### Retries and timing

- **`withLlmThrottleRetries`** (`src/lib/llmThrottleRetry.ts`): exponential backoff on messages suggesting throttling / 429 / overload (especially for Bedrock). **`LLM_THROTTLE_MAX_RETRIES`** (default 6).
- Gemini JSON calls still use their existing retry path inside `generateJsonText`.
- **`EVALUATE_LOG_TIMING=1`**: JSON lines from `evaluate` (`evaluate_cv_llm`, `evaluate_batch_llm`, `evaluate_job_done`) and from bulk (`bulk_eval` / `job_eval_wall_ms`).

## Cost and throughput (mental model)

- **Embedding work**: dominated by building the matrix (batch job embeddings + per-job × all-CV scoring in memory).
- **LLM work (per-CV mode)**: up to **`BULK_JOB_CONCURRENCY` × `EVALUATE_CV_CONCURRENCY`** concurrent calls, capped by **`BULK_LLM_GLOBAL_CONCURRENCY`** when set.
- **LLM work (batch mode)**: **one** call per job (large prompt; all K résumés truncated per CV in the batch builders).

## Related UI

Analytics client: `src/app/analytics/AnalyticsClient.tsx` — **Bulk LLM evaluate top K**, top K / floor inputs, **Skip unchanged**, **Batch LLM (1 call/job)**, and NDJSON stream handling.
