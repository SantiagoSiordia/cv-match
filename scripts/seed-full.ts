/**
 * Full wipe + JD JSONL seed + up to N CV PDFs (default 1500, max 5000).
 *
 *   npx tsx scripts/seed-full.ts
 *   npx tsx scripts/seed-full.ts 50
 *
 * Requires .env with Bedrock and/or Gemini (same routing as the app).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseSeedMaxCvFilesRequest,
  runFullSeed,
} from "../src/lib/fullSeed";

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
  const arg = process.argv[2];
  const maxParsed = parseSeedMaxCvFilesRequest(
    arg === undefined ? undefined : arg,
  );
  if (!maxParsed.ok) {
    console.error(maxParsed.message);
    process.exit(1);
  }
  await runFullSeed(
    (e) => {
      console.error(JSON.stringify(e));
    },
    { maxCvFiles: maxParsed.value },
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
