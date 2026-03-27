/**
 * Download all PDFs under `pdf/` from arefinnomi/curriculum_vitae_data into cvs-* folders.
 *
 *   npx tsx scripts/ingest-github-cv-dataset.ts
 *
 * Optional env:
 *   INGEST_CV_AI=1  — run Bedrock metadata per file (slow, many API calls)
 *   INGEST_CONCURRENCY=4 — parallel downloads + PDF parse (default 3)
 *   INGEST_MAX_FILES=100 — cap for testing
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { persistCvPdf } from "../src/lib/storage";

const OWNER = "arefinnomi";
const REPO = "curriculum_vitae_data";
const BRANCH = "master";

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* no .env */
  }
}

type TreeEntry = { path: string; type: string; size?: number };

async function fetchTree(): Promise<TreeEntry[]> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cv-match-ingest",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub tree API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { tree: TreeEntry[] };
  return data.tree;
}

function rawUrl(filePath: string) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`;
}

async function main() {
  loadDotEnv();
  const skipAi =
    process.env.INGEST_CV_AI !== "1" &&
    process.env.INGEST_CV_GEMINI !== "1";
  const conc = Math.max(
    1,
    Math.min(12, Number(process.env.INGEST_CONCURRENCY) || 3),
  );
  const maxFiles = process.env.INGEST_MAX_FILES
    ? Number(process.env.INGEST_MAX_FILES)
    : Infinity;

  if (skipAi) {
    console.log(
      "Skipping AI metadata (set INGEST_CV_AI=1 or legacy INGEST_CV_GEMINI=1 to enable).",
    );
  }
  console.log(`Concurrency: ${conc}`);

  const tree = await fetchTree();
  const pdfPaths = tree
    .filter(
      (e) =>
        e.type === "blob" &&
        e.path.startsWith("pdf/") &&
        e.path.toLowerCase().endsWith(".pdf"),
    )
    .map((e) => e.path)
    .sort();

  const targets =
    Number.isFinite(maxFiles) && maxFiles > 0
      ? pdfPaths.slice(0, maxFiles)
      : pdfPaths;

  console.log(`Found ${pdfPaths.length} PDFs in repo; ingesting ${targets.length}.`);

  let done = 0;
  let ok = 0;
  let failed = 0;
  const errors: string[] = [];
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= targets.length) break;
      const p = targets[i];
      const name = path.basename(p);
      try {
        const res = await fetch(rawUrl(p), {
          headers: { "User-Agent": "cv-match-ingest" },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 10 * 1024 * 1024) {
          throw new Error("exceeds 10 MB");
        }
        await persistCvPdf(buf, name, { skipAi });
        ok++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${name}: ${msg}`);
      }
      done++;
      if (done % 50 === 0 || done === targets.length) {
        console.log(`Progress ${done}/${targets.length} (ok ${ok}, failed ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: conc }, () => worker()));

  console.log(`Finished. OK ${ok}, failed ${failed}.`);
  if (errors.length) {
    const head = errors.slice(0, 20);
    console.log("Sample errors:");
    for (const line of head) console.log(`  ${line}`);
    if (errors.length > 20) console.log(`  … ${errors.length - 20} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
