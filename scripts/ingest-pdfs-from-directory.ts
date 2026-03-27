/**
 * Ingest PDFs from a folder into `cvs-pdf/`, `cvs-extracted/`, `cvs-meta/`.
 *
 * Usage (from repo root):
 *   npx tsx scripts/ingest-pdfs-from-directory.ts /path/to/pdf-folder
 *
 * By default skips Gemini per file (fast, no API usage). To extract metadata:
 *   INGEST_CV_AI=1 npx tsx scripts/ingest-pdfs-from-directory.ts /path/to/pdf
 */

import { readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { persistCvPdf } from "../src/lib/storage";

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

async function main() {
  loadDotEnv();
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: npx tsx scripts/ingest-pdfs-from-directory.ts <pdf-directory>");
    process.exit(1);
  }
  const abs = path.resolve(dir);
  const st = await stat(abs).catch(() => null);
  if (!st?.isDirectory()) {
    console.error(`Not a directory: ${abs}`);
    process.exit(1);
  }

  const skipAi =
    process.env.INGEST_CV_AI !== "1" &&
    process.env.INGEST_CV_GEMINI !== "1";
  if (skipAi) {
    console.log(
      "INGEST_CV_AI=1 (or legacy INGEST_CV_GEMINI=1) not set — skipping AI metadata per file.",
    );
  }

  const names = await readdir(abs);
  const pdfs = names.filter((n) => n.toLowerCase().endsWith(".pdf"));
  pdfs.sort();

  let ok = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const name of pdfs) {
    const fp = path.join(abs, name);
    try {
      const buf = await readFile(fp);
      if (buf.length > 10 * 1024 * 1024) {
        skipped++;
        errors.push(`${name}: exceeds 10 MB`);
        continue;
      }
      await persistCvPdf(buf, name, { skipAi });
      ok++;
      if (ok % 25 === 0) console.log(`… ${ok} / ${pdfs.length}`);
    } catch (e) {
      skipped++;
      errors.push(
        `${name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(`Done. Imported ${ok} PDFs, skipped/failed ${skipped}.`);
  if (errors.length) {
    const show = errors.slice(0, 15);
    console.log("Issues (first 15):");
    for (const line of show) console.log(`  ${line}`);
    if (errors.length > 15) console.log(`  … and ${errors.length - 15} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
