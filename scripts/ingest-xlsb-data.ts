/**
 * Import job requirements and candidate profiles from an Excel .xlsb workbook.
 *
 * Expected sheets:
 * - "Open Requirements" — staffing-style rows (imported like CSV job requirements).
 * - "Profile" — employee number, name, core competency, experience; each row becomes
 *   a minimal PDF placeholder until you upload a real résumé.
 *
 * Usage (from repo root):
 *   npx tsx scripts/ingest-xlsb-data.ts /path/to/Data.xlsb
 *   npx tsx scripts/ingest-xlsb-data.ts --jobs-only /path/to/file.xlsb
 *   npx tsx scripts/ingest-xlsb-data.ts --profiles-only /path/to/file.xlsb
 *
 * Résumé AI metadata (Bedrock): set INGEST_CV_AI=1 like other ingest scripts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  buildExtractedNarrativeFromRow,
  dedupeHeaderNames,
  inferSkillsFromRow,
  inferTitleGuessFromRow,
  isEffectivelyEmptyRow,
  rowOriginalDisplayName,
  sourceRequirementIdFromRow,
} from "../src/lib/csvJobRequirements";
import {
  persistCvPdf,
  persistJobDescriptionFromCsvRow,
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

function sheetToRecords(ws: XLSX.WorkSheet): Record<string, string>[] {
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
  if (rows.length < 2) return [];
  const headerCells = rows[0]!.map((h) => String(h ?? "").trim() || "Column");
  const headers = dedupeHeaderNames(headerCells);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]!] = String(r[j] ?? "").trim();
    }
    if (!isEffectivelyEmptyRow(obj)) out.push(obj);
  }
  return out;
}

/** Map abbreviated export columns into fields the job importer expects for titles. */
function enrichJobRow(row: Record<string, string>): Record<string, string> {
  const reqId = String(row["Requirement Id"] ?? "").trim();
  const competency = String(
    row["Primary Competency Proficiency Details"] ?? "",
  ).trim();
  const customer = String(row["Customer Name"] ?? "").trim();
  const fallback =
    [competency, customer].filter(Boolean).join(" · ") ||
    (reqId ? `Requirement ${reqId}` : "Role");
  return {
    ...row,
    Role: row["Role"]?.trim() || fallback,
    "Opportunity Name": row["Opportunity Name"]?.trim() || fallback,
  };
}

function sanitizePdfLine(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .slice(0, 600);
}

function wrapLines(text: string, maxLen: number): string[] {
  const t = text.trim();
  if (!t) return [];
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLen && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function profileRowToPdfBytes(
  row: Record<string, string>,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 10;
  const lineHeight = 12;
  const margin = 50;
  const emp =
    row["Employee Number"] ??
    row["Employee number"] ??
    row["EmployeeNumber"] ??
    "";
  const name = row["Employee Name"] ?? "";
  const competency =
    row["Core Competency "] ?? row["Core Competency"] ?? row["Core competency"] ?? "";
  const exp = row["Total Exp"] ?? row["Total Experience"] ?? "";

  const headerLines = [
    "Résumé placeholder (imported from spreadsheet — upload a PDF to replace).",
    "",
    `Employee Number: ${sanitizePdfLine(String(emp))}`,
    `Name: ${sanitizePdfLine(String(name))}`,
    `Total experience (years): ${sanitizePdfLine(String(exp))}`,
    "",
    "Core competency:",
  ];
  const bodyLines = wrapLines(sanitizePdfLine(String(competency)), 82);

  let page = pdf.addPage([612, 792]);
  let y = 720;

  function newline() {
    y -= lineHeight;
    if (y < margin) {
      page = pdf.addPage([612, 792]);
      y = 720;
    }
  }

  for (const line of [...headerLines, ...bodyLines]) {
    page.drawText(line || " ", {
      x: margin,
      y,
      size,
      font,
      maxWidth: 512,
    });
    newline();
  }

  return pdf.save();
}

async function importProfiles(rows: Record<string, string>[], skipAi: boolean) {
  let ok = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const emp = String(row["Employee Number"] ?? "").trim();
    const name = String(row["Employee Name"] ?? "").trim() || "candidate";
    const safeFile = `${emp || "unknown"}-${name.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
    try {
      const pdfBytes = await profileRowToPdfBytes(row);
      const buf = Buffer.from(pdfBytes);
      await persistCvPdf(buf, safeFile, { skipAi });
      ok++;
    } catch (e) {
      errors.push(
        `${emp}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  console.log(`Profiles: imported ${ok} placeholder PDF(s).`);
  if (errors.length) {
    console.log(`Profiles: ${errors.length} error(s) (first 10):`);
    for (const line of errors.slice(0, 10)) console.log(`  ${line}`);
  }
}

async function importJobs(rows: Record<string, string>[], sourceLabel: string) {
  const sourceFileName = `${path.basename(sourceLabel, path.extname(sourceLabel))}.xlsx-import.csv`;
  let ok = 0;
  const errors: { row: number; message: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]!;
    const row = enrichJobRow(raw);
    try {
      const extracted = buildExtractedNarrativeFromRow(row);
      const titleGuess = inferTitleGuessFromRow(row);
      const extractedSkills = inferSkillsFromRow(row);
      const sourceRequirementId = sourceRequirementIdFromRow(row);
      const originalName = rowOriginalDisplayName(sourceFileName, row);
      await persistJobDescriptionFromCsvRow({
        structuredFields: { ...row },
        extracted,
        originalName,
        sourceFileName,
        sourceRequirementId,
        titleGuess,
        extractedSkills,
      });
      ok++;
      if (ok % 400 === 0) console.log(`… jobs ${ok} / ${rows.length}`);
    } catch (e) {
      errors.push({
        row: i + 2,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  console.log(`Open Requirements: imported ${ok} job row(s).`);
  if (errors.length) {
    console.log(`Open Requirements: ${errors.length} row error(s) (first 8):`);
    for (const er of errors.slice(0, 8)) {
      console.log(`  row ${er.row}: ${er.message}`);
    }
  }
}

function parseArgs(argv: string[]) {
  let jobsOnly = false;
  let profilesOnly = false;
  const rest: string[] = [];
  for (const a of argv) {
    if (a === "--jobs-only") jobsOnly = true;
    else if (a === "--profiles-only") profilesOnly = true;
    else rest.push(a);
  }
  if (jobsOnly && profilesOnly) {
    console.error("Use only one of --jobs-only or --profiles-only");
    process.exit(1);
  }
  return { jobsOnly, profilesOnly, pathArg: rest[0] };
}

async function main() {
  loadDotEnv();
  await initStorageDirs();

  const argv = process.argv.slice(2);
  const { jobsOnly, profilesOnly, pathArg } = parseArgs(argv);
  const defaultPath =
    "/Users/santi/Projects/file-sharing/shared-files/Data - May11.xlsb";
  const xlsbPath = pathArg
    ? path.resolve(pathArg)
    : path.resolve(defaultPath);

  const skipAi = process.env.INGEST_CV_AI !== "1";
  if (!profilesOnly && skipAi) {
    console.log(
      "INGEST_CV_AI=1 not set — skipping Bedrock metadata on placeholder résumé PDFs.",
    );
  }

  let buf: Buffer;
  try {
    buf = readFileSync(xlsbPath);
  } catch {
    console.error(`Cannot read file: ${xlsbPath}`);
    process.exit(1);
  }

  const wb = XLSX.read(buf, { type: "buffer", bookVBA: false });
  const names = wb.SheetNames;
  console.log(`Workbook sheets: ${names.join(", ")}`);

  if (!jobsOnly) {
    const wsProfile =
      wb.Sheets["Profile"] ?? wb.Sheets["Profiles"] ?? wb.Sheets["Candidates"];
    if (!wsProfile) {
      console.warn('No "Profile" sheet — skipping candidates.');
    } else {
      const rows = sheetToRecords(wsProfile);
      console.log(`Profile sheet: ${rows.length} data row(s).`);
      await importProfiles(rows, skipAi);
    }
  }

  if (!profilesOnly) {
    const wsJobs =
      wb.Sheets["Open Requirements"] ??
      wb.Sheets["Open requirements"] ??
      wb.Sheets["Requirements"];
    if (!wsJobs) {
      console.warn('No "Open Requirements" sheet — skipping jobs.');
    } else {
      const rows = sheetToRecords(wsJobs);
      console.log(`Open Requirements sheet: ${rows.length} data row(s).`);
      await importJobs(rows, xlsbPath);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
