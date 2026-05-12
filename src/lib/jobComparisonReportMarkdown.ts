import type {
  EnrichedJobCvMatchRow,
  JobEmbeddingRankPayload,
} from "@/lib/jobEmbeddingRankPayload";

const JD_EXCERPT_MAX = 14_000;

function mdTableCell(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, " ")
    .trim();
}

/** Normalize for comparing filename vs embedding title line (avoid duplicate résumé column). */
function normResumeLabel(s: string): string {
  const t = s.trim().toLowerCase();
  const noExt = t.replace(/\.(pdf|docx?|txt|json)$/i, "");
  return noExt.replace(/\s+/g, " ");
}

/** Only used when the report includes a Tier column (`jobRequiresTechnicalOrdering`). */
function tierLabel(row: EnrichedJobCvMatchRow): string {
  if (row.skipped) {
    return row.technicalBucket ?? "unknown";
  }
  const b = row.technicalBucket;
  if (b === "non_technical") return "non-technical";
  if (b === "technical") return "technical";
  if (b === "unknown") return "unknown";
  return "n/a";
}

/** Use a longer fence when the body contains triple backticks. */
function fencedCodeBlock(lang: string, body: string): string {
  let fence = "```";
  while (body.includes(fence)) {
    fence += "`";
  }
  return `\n${fence}${lang}\n${body}\n${fence}\n`;
}

/** Markdown consumed by the job comparison PDF route (`md2pdf` CLI). */
export function buildJobComparisonReportMarkdown(
  payload: JobEmbeddingRankPayload,
): string {
  const jdExcerpt = payload.jobText.slice(0, JD_EXCERPT_MAX);
  const jdOmitted =
    payload.jobText.length > jdExcerpt.length
      ? `\n\n_(${payload.jobText.length - jdExcerpt.length} more characters omitted in this report.)_`
      : "";

  const showTierColumn = payload.jobRequiresTechnicalOrdering;

  const tableRows = payload.matches.map((row, i) => {
    const rnk = i + 1;
    const score = row.skipped ? "-" : String(row.scorePercent);
    const cos = row.skipped ? "-" : row.cosineSimilarity.toFixed(4);
    const name = mdTableCell(row.cvOriginalName);
    const skip =
      row.skipped && row.skipReason ? mdTableCell(`(${row.skipReason})`) : "";
    const tl = row.cvDocumentTitleLine?.trim();
    const titleExtra =
      tl && normResumeLabel(tl) !== normResumeLabel(row.cvOriginalName)
        ? mdTableCell(tl)
        : "";
    const resumeParts = [name, skip, titleExtra].filter(Boolean);
    const resumeCol = resumeParts.join(" ");
    const tierCell = showTierColumn ? `${mdTableCell(tierLabel(row))} | ` : "";
    return `| ${rnk} | ${score} | ${cos} | ${tierCell}${resumeCol} |`;
  });

  const tableHeader = showTierColumn
    ? "| Rank | Score % | Cosine | Tier | Résumé |\n| ---: | ------: | -----: | :--- | ------ |"
    : "| Rank | Score % | Cosine | Résumé |\n| ---: | ------: | -----: | ------ |";

  const metaLines = [
    `- **Job ID:** \`${payload.jobDescriptionId}\``,
    `- **Generated (UTC):** ${new Date().toISOString()}`,
    `- **Embedding model:** \`${payload.meta.embeddingModelId}\``,
    `- **Index key:** \`${payload.meta.embeddingIndexModelKey}\``,
    `- **Résumé index entries:** ${payload.meta.embeddingIndexEntryCount}`,
    `- **Max embedding chars / side:** ${payload.meta.maxEmbeddingChars}`,
    `- **Job query truncated for embed:** ${payload.meta.jobQueryInputTruncated ? "yes" : "no"}`,
    `- **Technical tier ordering:** ${payload.jobRequiresTechnicalOrdering ? "yes" : "no"}`,
  ].join("\n");

  return `# CV-Match - job comparison report

[TOC]

## Role

${payload.jobTitle.replace(/\r\n/g, "\n")}

${metaLines}

## Job description (extracted excerpt)

${fencedCodeBlock("text", jdExcerpt + jdOmitted)}

## All profiles vs this role

${tableHeader}
${tableRows.join("\n")}
`;
}
