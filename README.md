# CV Match

Web app to **upload CVs (PDF)** and **job descriptions** (PDF or text), then **score candidates against a role** using [Google Gemini](https://ai.google.dev/). Results are stored on disk as JSON so you can compare runs over time.

Product goals and features are summarized in [PRD.md](./PRD.md).

---

## What you need installed

| Requirement | Notes |
|-------------|--------|
| **Node.js** | **20.x or newer** (LTS recommended). [nodejs.org](https://nodejs.org/) |
| **npm** | Ships with Node; this repo uses `package-lock.json`. |
| **Gemini API key** | Free tier available via [Google AI Studio](https://aistudio.google.com/apikey). Used only on the server. |

Optional:

- **Git** — to clone this repository.
- **GitHub CLI (`gh`)** — only if you use it for other workflows; not required to run the app.

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/SantiagoSiordia/cv-match.git
cd cv-match
npm install
```

### 2. Environment variables

Create a `.env` file in the project root (same folder as `package.json`):

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
GEMINI_API_KEY=your_key_here
```

Optional:

```env
GEMINI_MODEL=gemini-2.0-flash
```

If `GEMINI_MODEL` is omitted, the app uses its built-in default (see `src/lib/constants.ts`).

Restart the dev server after changing `.env`.

### 3. Local data folders

The app writes uploads and evaluation history under the project root:

| Folder | Purpose |
|--------|---------|
| `cvs-pdf/` | CV PDFs (`{uuid}.pdf`) |
| `cvs-extracted/` | Text extracted from each CV |
| `cvs-meta/` | Metadata JSON per CV |
| `job-descriptions/` | Uploaded JD files + sidecars |
| `evaluations/` | One JSON file per evaluation run |

These directories are **gitignored** in this repo (only `.gitkeep` files are committed). They are created automatically when you use the app.

---

## How to run

### Development (hot reload)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build (local)

```bash
npm run build
npm run start
```

Then open [http://localhost:3000](http://localhost:3000).

### Quality checks (lint, types, tests)

```bash
npm run check
```

Other useful scripts:

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint only |
| `npm run test` | Vitest once |
| `npm run test:watch` | Vitest watch mode |

---

## Optional: bulk CV dataset

This project includes scripts to import a **public dataset** of sample CV PDFs for testing. It is **not** required to run the app.

**Source repository:** [arefinnomi/curriculum_vitae_data](https://github.com/arefinnomi/curriculum_vitae_data)

- PDFs live under the `pdf/` folder on the default branch.
- The dataset is described in that repo’s README and licensed under **ODbL** / **Database Contents License** — see their [LICENSE](https://github.com/arefinnomi/curriculum_vitae_data/blob/master/LICENSE.md) before redistributing.

**Import all PDFs from that GitHub repo** (downloads over the network; does **not** call Gemini per file unless you opt in):

```bash
npm run ingest:cv-dataset
```

- Default: **skips** Gemini metadata (fast, no API usage per CV).  
- To run Gemini metadata on every file (slow, many API calls):  
  `INGEST_CV_GEMINI=1 npm run ingest:cv-dataset`

Tuning:

- `INGEST_CONCURRENCY=4` — parallel downloads/parsing (default `3`).
- `INGEST_MAX_FILES=50` — cap for a quick test.

**Import from a local folder of PDFs:**

```bash
npx tsx scripts/ingest-pdfs-from-directory.ts /path/to/folder-of-pdfs
```

If you ever had CVs in a **single** `cvs/` folder and move to the split layout (`cvs-pdf/`, `cvs-extracted/`, `cvs-meta/`):

```bash
npm run migrate:cvs-layout
```

---

## Deploying

The app expects a **persistent disk** for the folders above. Default **serverless** hosts often have **ephemeral** filesystems — uploads disappear after the request — unless you attach storage or move to object storage later.

---

## Security notes

- Never commit `.env` or API keys.
- Do not expose `GEMINI_API_KEY` in client-side code; this app keeps it on the server (Next.js Route Handlers).
