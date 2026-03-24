/**
 * One-time: move flat `cvs/{uuid}.*` into `cvs-pdf/`, `cvs-extracted/`, `cvs-meta/`.
 * Safe to re-run (skips if source file missing).
 *
 *   npx tsx scripts/migrate-cvs-to-split-layout.ts
 */

import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const legacy = path.join(root, "cvs");
  const pdfDir = path.join(root, "cvs-pdf");
  const extractedDir = path.join(root, "cvs-extracted");
  const metaDir = path.join(root, "cvs-meta");

  await mkdir(pdfDir, { recursive: true });
  await mkdir(extractedDir, { recursive: true });
  await mkdir(metaDir, { recursive: true });

  let names: string[];
  try {
    names = await readdir(legacy);
  } catch {
    console.log("No legacy cvs/ folder — nothing to migrate.");
    return;
  }

  let moved = 0;
  for (const name of names) {
    if (name === ".gitkeep") continue;
    const from = path.join(legacy, name);
    let to: string;
    if (name.endsWith(".pdf")) {
      to = path.join(pdfDir, name);
    } else if (name.endsWith(".extracted.txt")) {
      to = path.join(extractedDir, name);
    } else if (name.endsWith(".meta.json")) {
      to = path.join(metaDir, name);
    } else {
      console.warn(`Skipping unknown file in cvs/: ${name}`);
      continue;
    }
    try {
      await rename(from, to);
      moved++;
    } catch (e) {
      console.warn(`Could not move ${name}:`, e);
    }
  }

  console.log(`Migrated ${moved} files from cvs/ into cvs-pdf, cvs-extracted, cvs-meta.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
