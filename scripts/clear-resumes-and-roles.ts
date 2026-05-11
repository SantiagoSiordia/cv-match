/**
 * Delete all CVs, job descriptions, cached embeddings, and saved evaluation runs.
 *
 * Usage (from repo root):
 *   npx tsx scripts/clear-resumes-and-roles.ts
 *
 * Respects `CV_MATCH_DATA_ROOT` (see `.env`) like the rest of the app.
 */

import { readFileSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { embeddingsDir, evaluationsDir } from "../src/lib/paths";
import {
  deleteAllCvs,
  deleteAllJobDescriptions,
  initStorageDirs,
} from "../src/lib/storage";

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

async function unlinkAllInDir(
  dir: string,
  opts: { match?: RegExp } = {},
): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of names) {
    if (name.startsWith(".")) continue;
    if (opts.match && !opts.match.test(name)) continue;
    try {
      await unlink(path.join(dir, name));
      n++;
    } catch {
      /* ignore */
    }
  }
  return n;
}

async function main() {
  loadDotEnv();
  await initStorageDirs();

  const nCvs = await deleteAllCvs();
  const nJobs = await deleteAllJobDescriptions();
  const nEmb = await unlinkAllInDir(embeddingsDir());
  const nEval = await unlinkAllInDir(evaluationsDir(), { match: /\.json$/ });

  console.log(
    `Removed ${nCvs} résumé(s), ${nJobs} role(s), ${nEmb} embedding file(s), ${nEval} evaluation run(s).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
