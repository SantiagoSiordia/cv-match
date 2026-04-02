import path from "node:path";
import { readFile } from "node:fs/promises";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import {
  curriculumVitaeDatasetRawUrl,
  fetchCurriculumVitaeDatasetTree,
  listPdfPathsInDatasetTree,
} from "@/lib/githubCvDataset";
import {
  deleteAllCvs,
  deleteAllJobDescriptions,
  persistCvPdf,
  saveJobDescriptionFromText,
} from "@/lib/storage";
import {
  SEED_DEFAULT_MAX_CV_FILES,
  SEED_MAX_CV_FILES_CAP,
} from "@/lib/seedLimits";

export type SeedProgressEvent =
  | { phase: "cleared_cvs"; count: number }
  | { phase: "cleared_jds"; count: number }
  | {
      phase: "jd_progress";
      imported: number;
      failed: number;
      total: number;
    }
  | { phase: "jd_done"; imported: number; failed: number }
  | {
      phase: "cv_progress";
      done: number;
      total: number;
      ok: number;
      failed: number;
    }
  | {
      phase: "done";
      jdImported: number;
      jdFailed: number;
      cvOk: number;
      cvFailed: number;
    }
  | { phase: "error"; message: string };

export {
  SEED_DEFAULT_MAX_CV_FILES,
  SEED_MAX_CV_FILES_CAP,
} from "@/lib/seedLimits";

const DEFAULT_JD_RELATIVE = "scripts/seed/tcs-jds-1500.jsonl";

/**
 * Parse optional `maxCvFiles` from API/CLI (integer 1..SEED_MAX_CV_FILES_CAP).
 * Omitted → default count.
 */
export function parseSeedMaxCvFilesRequest(raw: unknown):
  | { ok: true; value: number }
  | { ok: false; message: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: SEED_DEFAULT_MAX_CV_FILES };
  }
  let n: number;
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) {
      return {
        ok: false,
        message: `maxCvFiles must be a whole number between 1 and ${SEED_MAX_CV_FILES_CAP}.`,
      };
    }
    n = raw;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) {
      return {
        ok: false,
        message: `maxCvFiles must be an integer between 1 and ${SEED_MAX_CV_FILES_CAP}.`,
      };
    }
    n = parseInt(t, 10);
  } else {
    return {
      ok: false,
      message: `maxCvFiles must be an integer between 1 and ${SEED_MAX_CV_FILES_CAP}.`,
    };
  }
  if (n < 1 || n > SEED_MAX_CV_FILES_CAP) {
    return {
      ok: false,
      message: `maxCvFiles must be between 1 and ${SEED_MAX_CV_FILES_CAP}.`,
    };
  }
  return { ok: true, value: n };
}

type Row = { title?: string; body?: string };

function seedCvConcurrency(): number {
  const n = Number(process.env.SEED_CV_CONCURRENCY);
  if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.floor(n));
  return 2;
}

async function emit(
  onEvent: (e: SeedProgressEvent) => void | Promise<void>,
  e: SeedProgressEvent,
) {
  await onEvent(e);
}

/**
 * Wipes all CVs and job descriptions, ingests JDs from JSONL, then up to
 * `maxCvFiles` PDFs from the public curriculum_vitae_data repo with LLM
 * metadata (`skipAi: false`), same as manual upload.
 */
export async function runFullSeed(
  onEvent: (e: SeedProgressEvent) => void | Promise<void>,
  options: {
    jdJsonlRelativePath?: string;
    maxCvFiles?: number;
    cvConcurrency?: number;
  } = {},
): Promise<{
  jdImported: number;
  jdFailed: number;
  cvOk: number;
  cvFailed: number;
}> {
  const jdRel = options.jdJsonlRelativePath ?? DEFAULT_JD_RELATIVE;
  const parsed = parseSeedMaxCvFilesRequest(options.maxCvFiles);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  const maxCvFiles = parsed.value;
  const conc = Math.max(
    1,
    Math.min(
      8,
      options.cvConcurrency ?? seedCvConcurrency(),
    ),
  );

  try {
    const nCvs = await deleteAllCvs();
    await emit(onEvent, { phase: "cleared_cvs", count: nCvs });

    const nJds = await deleteAllJobDescriptions();
    await emit(onEvent, { phase: "cleared_jds", count: nJds });

    const jdAbs = path.join(process.cwd(), jdRel);
    const raw = await readFile(jdAbs, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

    let jdOk = 0;
    let jdFailed = 0;
    const totalJd = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let row: Row;
      try {
        row = JSON.parse(line!) as Row;
      } catch {
        jdFailed++;
        continue;
      }
      const title =
        typeof row.title === "string" && row.title.trim()
          ? row.title.trim()
          : `Job ${i + 1}`;
      const body = typeof row.body === "string" ? row.body : "";
      if (!body.trim()) {
        jdFailed++;
        continue;
      }
      try {
        await saveJobDescriptionFromText(title, body, {
          skipTitleInference: true,
        });
        jdOk++;
      } catch {
        jdFailed++;
      }
      if ((i + 1) % 100 === 0 || i === lines.length - 1) {
        await emit(onEvent, {
          phase: "jd_progress",
          imported: jdOk,
          failed: jdFailed,
          total: totalJd,
        });
      }
    }

    await emit(onEvent, {
      phase: "jd_done",
      imported: jdOk,
      failed: jdFailed,
    });

    const tree = await fetchCurriculumVitaeDatasetTree();
    const pdfPaths = listPdfPathsInDatasetTree(tree);
    const targets = pdfPaths.slice(0, maxCvFiles);
    const total = targets.length;

    if (total === 0) {
      await emit(onEvent, {
        phase: "cv_progress",
        done: 0,
        total: 0,
        ok: 0,
        failed: 0,
      });
    }

    let done = 0;
    let cvOk = 0;
    let cvFailed = 0;
    let idx = 0;

    const reportCv = async () => {
      await emit(onEvent, {
        phase: "cv_progress",
        done,
        total,
        ok: cvOk,
        failed: cvFailed,
      });
    };

    async function worker() {
      while (true) {
        const i = idx++;
        if (i >= targets.length) break;
        const p = targets[i];
        const name = path.basename(p);
        try {
          const res = await fetch(curriculumVitaeDatasetRawUrl(p), {
            headers: { "User-Agent": "cv-match-seed" },
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > MAX_UPLOAD_BYTES) {
            throw new Error("exceeds 10 MB");
          }
          await persistCvPdf(buf, name, { skipAi: false });
          cvOk++;
        } catch {
          cvFailed++;
        }
        done++;
        if (done % 25 === 0 || done === total) {
          await reportCv();
        }
      }
    }

    await Promise.all(Array.from({ length: conc }, () => worker()));
    if (total > 0 && done % 25 !== 0) {
      await reportCv();
    }

    await emit(onEvent, {
      phase: "done",
      jdImported: jdOk,
      jdFailed,
      cvOk,
      cvFailed,
    });

    return {
      jdImported: jdOk,
      jdFailed,
      cvOk,
      cvFailed,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await emit(onEvent, { phase: "error", message });
    throw e;
  }
}
