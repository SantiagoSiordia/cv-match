/**
 * Ingest JSONL job descriptions (one JSON object per line: title, body) into
 * `job-descriptions/` without per-row Gemini title inference.
 *
 * Usage (from repo root):
 *   npx tsx scripts/ingest-job-descriptions-bulk.ts scripts/seed/tcs-jds-1500.jsonl
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { saveJobDescriptionFromText } from "../src/lib/storage";

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

type Row = { title?: string; body?: string };

async function main() {
  loadDotEnv();
  const file = process.argv[2];
  if (!file) {
    console.error(
      "Usage: npx tsx scripts/ingest-job-descriptions-bulk.ts <path-to.jsonl>",
    );
    process.exit(1);
  }

  const abs = path.resolve(file);
  const raw = await readFile(abs, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let row: Row;
    try {
      row = JSON.parse(line!) as Row;
    } catch {
      failed++;
      console.error(`Line ${i + 1}: invalid JSON`);
      continue;
    }
    const title =
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : `Job ${i + 1}`;
    const body = typeof row.body === "string" ? row.body : "";
    if (!body.trim()) {
      failed++;
      console.error(`Line ${i + 1}: empty body`);
      continue;
    }
    try {
      await saveJobDescriptionFromText(title, body, {
        skipTitleInference: true,
      });
      ok++;
      if (ok % 100 === 0) console.error(`… ${ok} / ${lines.length}`);
    } catch (e) {
      failed++;
      console.error(
        `Line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.error(`Done. Imported ${ok}, failed ${failed}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
