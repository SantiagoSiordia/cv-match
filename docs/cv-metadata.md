# CV metadata: creation and storage

This document describes how résumé (CV) **metadata** is produced, what it contains, and where it lives on disk. Implementation centers on `src/lib/storage.ts` and `src/lib/schemas.ts`.

## Data layout (three files per CV)

Each CV gets a new **UUID**. Three artifacts are written under the data root (`CV_MATCH_DATA_ROOT`, or the project cwd when unset — see `src/lib/paths.ts`):

| Location | File | Purpose |
| --- | --- | --- |
| `cvs-pdf/` | `{uuid}.pdf` | Original PDF bytes (`storageFileName` in meta). |
| `cvs-extracted/` | `{uuid}.extracted.txt` | Plain text from PDF extraction (may be empty if extraction failed). |
| `cvs-meta/` | `{uuid}.meta.json` | Canonical **CvStoredMeta** record (JSON). |

Listing and lookups read **`cvs-meta/*.meta.json`** only; PDF and extracted text are loaded by id when needed (`getCvMeta`, `readCvExtractedText`, `readCvPdfPath`).

## How metadata is created

### 1. Web upload (normal path)

1. The CVs UI posts multipart **`file`** or **`files`** to **`POST /api/cvs`** (`src/app/api/cvs/route.ts`).
2. The handler calls **`saveCvFromFile`** (`src/lib/storage.ts`), which:
   - Enforces **PDF only** (`application/pdf`) and **max size** (`MAX_UPLOAD_BYTES`, 10 MB — `src/lib/constants.ts`).
   - Delegates to **`persistCvPdf(buffer, originalName, { skipAi: false })`**.

### 2. Scripts (bulk ingest)

Scripts call **`persistCvPdf`** directly with optional **`skipAi: true`** to avoid LLM cost/latency on every file:

- `scripts/ingest-pdfs-from-directory.ts` — default **skips** AI unless `INGEST_CV_AI=1` or legacy `INGEST_CV_GEMINI=1`.
- `scripts/ingest-github-cv-dataset.ts` — same env flag pattern for optional per-file metadata.

### 3. What `persistCvPdf` does

Order of operations (`src/lib/storage.ts`):

1. **`initStorageDirs()`** — ensures `cvs-pdf`, `cvs-extracted`, `cvs-meta` exist.
2. **Assign id** — `randomUUID()`, PDF saved as `{id}.pdf`.
3. **Extract text** — `extractTextFromPdf(buffer)`; failures yield empty text and an internal extract error message for later `geminiError` if needed.
4. **Write** `{id}.extracted.txt`.
5. **`lowTextWarning`** — set when `0 < extractedCharCount < LOW_TEXT_THRESHOLD_CHARS` (120 chars).
6. **LLM structured metadata** (unless `skipAi`):
   - If there is extracted text: **`extractCvMetadataWithProvider(extracted)`** (`src/lib/aiProvider.ts`).
   - Provider selection: **Bedrock first** when configured (`AI_PROVIDER` / region / credentials), with **Gemini fallback** when eligible; or forced mode via `AI_PROVIDER`.
   - Parsed shape is **`CvGeminiMeta`** (Zod in `src/lib/schemas.ts`) — the disk field is still named **`gemini`** for historical reasons.
   - On failure: `gemini` may stay `null` and **`geminiError`** records the message (including “no provider” / extraction errors).
7. **`searchIndex`** — **`buildCvSearchIndex`** (`src/lib/cvSearchIndex.ts`): one lowercase string combining filename, upload ISO date, LLM fields, hard skills, and the **first 14_000** characters of extracted text (for client-side search).
8. **Write** `{id}.meta.json` with pretty-printed JSON.

The returned object is the same **`CvStoredMeta`** that was written to disk.

## Stored record shape (`CvStoredMeta`)

Defined in **`src/lib/schemas.ts`** (`cvStoredMetaSchema`):

| Field | Meaning |
| --- | --- |
| `id` | UUID. |
| `originalName` | Client filename (e.g. `resume.pdf`). |
| `uploadedAt` | ISO timestamp when the record was created. |
| `type` | Always `"cv"`. |
| `storageFileName` | PDF filename under `cvs-pdf/` (currently `{id}.pdf`). |
| `extractedCharCount` | Length of extracted plain text. |
| `lowTextWarning` | Optional flag when text is very short but non-empty. |
| `gemini` | Optional **`CvGeminiMeta`** from the LLM (name, location, currentPosition, hardSkills, experienceSummary — normalized to `""` / `[]` when unknown). Accepts legacy keys `title` / `skills` on parse. |
| `geminiError` | Optional error string when extraction failed or was skipped due to empty text. |
| `searchIndex` | Optional denormalized search blob (always set on fresh writes in `persistCvPdf`). |

**`CvGeminiMeta`** (still the type name): `name`, `location`, `currentPosition`, `hardSkills` (max 40 strings), `experienceSummary`.

## Reading and listing

- **`listCvs()`** — reads every `*.meta.json` in `cvs-meta/`, filters `type === "cv"`, **coerces** `gemini` through `cvGeminiMetaSchema` for backward compatibility, sorts by **`uploadedAt` descending**.
- **`getCvMeta(id)`** — reads one `{id}.meta.json`; returns `null` if missing or wrong type.

**`GET /api/cvs`** uses `listCvs()` to return **`{ items: CvStoredMeta[] }`**.

## Lazy updates: `prepareCvForMatch`

**`prepareCvForMatch(cvId)`** (`src/lib/storage.ts`) runs **before** **`POST /api/cvs/[id]/match-jobs`**.

If the CV has extractable text and metadata is considered **incomplete**, it:

1. Re-runs **`extractCvMetadataWithProvider`** (full backfill when `cvNeedsGeminiBackfill`: no `gemini`, or missing identity, or no skills, or empty experience summary).
2. Optionally **`guessCvTitleWithProvider`** if `currentPosition` is still empty after extraction.
3. Rebuilds **`searchIndex`** and **rewrites** `{id}.meta.json`.

Config errors from the AI provider can be **re-thrown** so the API can surface them; some failures set **`geminiError`** and still return meta so matching can proceed.

## Related code (quick index)

| Area | Location |
| --- | --- |
| Persist pipeline | `persistCvPdf`, `saveCvFromFile` — `src/lib/storage.ts` |
| Paths / data root | `src/lib/paths.ts` |
| Schema types | `src/lib/schemas.ts` |
| Search index string | `src/lib/cvSearchIndex.ts` |
| Client search | `getCvSearchHaystack`, `cvMatchesSearchQuery` — `src/lib/cvSearchFilter.ts` |
| LLM extraction (Bedrock) | `extractCvMetadataWithBedrock` — `src/lib/bedrock.ts` |
| LLM extraction (Gemini) | `extractCvMetadataWithGemini` — `src/lib/gemini.ts` |
| Provider routing | `extractCvMetadataWithProvider` — `src/lib/aiProvider.ts` |
| Upload API | `src/app/api/cvs/route.ts` |
| Single CV API | `src/app/api/cvs/[id]/route.ts` |

## Embeddings note

Embedding indexes for matching are **separate** from the metadata JSON (see `embeddings/` and `src/lib/embeddings.ts`). Building or updating embeddings is not the same as writing `{id}.meta.json`, though both use the same CV id and extracted text.
