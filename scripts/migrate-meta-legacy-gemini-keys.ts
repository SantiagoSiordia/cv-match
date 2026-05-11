/**
 * One-time: rename legacy `gemini*` keys in `*.meta.json` to `extracted*`.
 * Safe to re-run (only writes when legacy keys exist).
 *
 *   npx tsx scripts/migrate-meta-legacy-gemini-keys.ts
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cvsMetaDir, jobDescriptionsDir } from "../src/lib/paths";

async function migrateCvMetaDir(): Promise<number> {
  let n = 0;
  const dir = cvsMetaDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    const full = path.join(dir, name);
    const raw = await readFile(full, "utf8");
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj.type !== "cv") continue;
    let changed = false;
    if ("gemini" in obj) {
      if (obj.extracted === undefined && obj.gemini !== undefined) {
        obj.extracted = obj.gemini;
      }
      delete obj.gemini;
      changed = true;
    }
    if ("geminiError" in obj) {
      if (obj.extractedError === undefined && obj.geminiError !== undefined) {
        obj.extractedError = obj.geminiError;
      }
      delete obj.geminiError;
      changed = true;
    }
    if (changed) {
      await writeFile(full, JSON.stringify(obj, null, 2), "utf8");
      n++;
    }
  }
  return n;
}

async function migrateJobMetaDir(): Promise<number> {
  let n = 0;
  const dir = jobDescriptionsDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.endsWith(".meta.json")) continue;
    const full = path.join(dir, name);
    const raw = await readFile(full, "utf8");
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj.type !== "job_description") continue;
    let changed = false;
    if ("geminiSkills" in obj) {
      if (
        obj.extractedSkills === undefined &&
        obj.geminiSkills !== undefined
      ) {
        obj.extractedSkills = obj.geminiSkills;
      }
      delete obj.geminiSkills;
      changed = true;
    }
    if ("geminiSkillsError" in obj) {
      if (
        obj.extractedSkillsError === undefined &&
        obj.geminiSkillsError !== undefined
      ) {
        obj.extractedSkillsError = obj.geminiSkillsError;
      }
      delete obj.geminiSkillsError;
      changed = true;
    }
    if ("geminiError" in obj) {
      if (obj.extractedError === undefined && obj.geminiError !== undefined) {
        obj.extractedError = obj.geminiError;
      }
      delete obj.geminiError;
      changed = true;
    }
    if (changed) {
      await writeFile(full, JSON.stringify(obj, null, 2), "utf8");
      n++;
    }
  }
  return n;
}

async function main() {
  const cvFiles = await migrateCvMetaDir();
  const jobFiles = await migrateJobMetaDir();
  console.log(
    `Migrated ${cvFiles} CV meta file(s) and ${jobFiles} job meta file(s).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
