import { DEFAULT_BEDROCK_EMBEDDING_MODEL, MAX_EMBEDDING_CHARS } from "@/lib/constants";
import type { CvMatchRow, JobCvMatrixRow } from "@/lib/embeddings";
import type { JobStoredMeta } from "@/lib/schemas";

const JD_EXCERPT_PER_JOB = 6_000;

function embeddingModelId(): string {
  return (
    process.env.BEDROCK_EMBEDDING_MODEL_ID?.trim() ||
    DEFAULT_BEDROCK_EMBEDDING_MODEL
  );
}

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

/** Use a longer fence when the body contains triple backticks. */
function fencedCodeBlock(lang: string, body: string): string {
  let fence = "```";
  while (body.includes(fence)) {
    fence += "`";
  }
  return `\n${fence}${lang}\n${body}\n${fence}\n`;
}

function jobTableRows(matches: CvMatchRow[]): string {
  return matches
    .map((row, i) => {
      const rnk = i + 1;
      const score = row.skipped ? "-" : String(row.scorePercent);
      const cos = row.skipped ? "-" : row.cosineSimilarity.toFixed(4);
      const name = mdTableCell(row.cvOriginalName);
      const skip =
        row.skipped && row.skipReason ? mdTableCell(`(${row.skipReason})`) : "";
      const resumeParts = [name, skip].filter(Boolean);
      const resumeCol = resumeParts.join(" ");
      return `| ${rnk} | ${score} | ${cos} | ${resumeCol} |`;
    })
    .join("\n");
}

export type AnalyticsReportMarkdownInput = {
  matrix: JobCvMatrixRow[];
  jobById: Map<string, JobStoredMeta>;
  jobTextById: Map<string, string>;
  cvIndex: {
    model: string;
    updatedAt?: string;
    entryCount: number;
  };
};

/**
 * Markdown for the analytics PDF: every role with full embedding rank table and a JD excerpt.
 */
export function buildAnalyticsReportMarkdown(input: AnalyticsReportMarkdownInput): string {
  const generated = new Date().toISOString();
  const sorted = [...input.matrix].sort((a, b) => {
    const t = a.jobTitle.localeCompare(b.jobTitle);
    if (t !== 0) return t;
    return a.jobDescriptionId.localeCompare(b.jobDescriptionId);
  });

  const metaLines = [
    `- **Generated (UTC):** ${generated}`,
    `- **Roles in export:** ${sorted.length}`,
    `- **Embedding model:** \`${embeddingModelId()}\``,
    `- **Résumé index key:** \`${input.cvIndex.model}\``,
    `- **Résumé index entries:** ${input.cvIndex.entryCount}`,
    `- **Résumé index updated:** ${input.cvIndex.updatedAt ?? "unknown"}`,
    `- **Max embedding chars / side:** ${MAX_EMBEDDING_CHARS}`,
    `- **Per-role JD excerpt cap:** ${JD_EXCERPT_PER_JOB} characters`,
  ].join("\n");

  const sections = sorted.map((row) => {
    const job = input.jobById.get(row.jobDescriptionId);
    const rawText = input.jobTextById.get(row.jobDescriptionId) ?? "";
    const excerpt = rawText.slice(0, JD_EXCERPT_PER_JOB);
    const omitted =
      rawText.length > excerpt.length
        ? `\n\n_(${rawText.length - excerpt.length} more characters omitted.)_`
        : "";
    const skills = (job?.extractedSkills ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    const skillsLine =
      skills.length > 0
        ? `\n- **Inferred job skills (metadata):** ${mdTableCell(skills.join(", "))}`
        : "";

    const jobMetaLines = [
      `- **Job ID:** \`${row.jobDescriptionId}\``,
      job?.sourceRequirementId
        ? `- **Source requirement id:** \`${job.sourceRequirementId}\``
        : null,
      job?.lowTextWarning != null
        ? `- **Low text warning:** ${job.lowTextWarning ? "yes" : "no"}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const tableHeader =
      "| Rank | Score % | Cosine | Résumé |\n| ---: | ------: | -----: | ------ |";

    return `## ${mdTableCell(row.jobTitle)}

${jobMetaLines}
${skillsLine}

### Job description (extracted excerpt)

${fencedCodeBlock("text", excerpt + omitted)}

### All résumés vs this role (embedding rank)

${tableHeader}
${jobTableRows(row.matches)}
`;
  });

  return `# CV-Match — analytics report (all roles)

[TOC]

## Summary

${metaLines}

${sections.join("\n\n")}
`;
}
