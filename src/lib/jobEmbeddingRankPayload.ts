import {
  DEFAULT_BEDROCK_EMBEDDING_MODEL,
  MAX_EMBEDDING_CHARS,
} from "@/lib/constants";
import {
  cvTitleLineForEmbedding,
  rankCvsAgainstJob,
  readCvEmbeddingIndexSnapshot,
  truncateForEmbedding,
  type CvMatchRow,
} from "@/lib/embeddings";
import type { CvStoredMeta, JobStoredMeta } from "@/lib/schemas";
import { getJobMeta, listCvs, readJobExtractedText } from "@/lib/storage";
import {
  cvIsClearlyNonTechnical,
  jobRequiresTechnicalCandidates,
} from "@/lib/technicalRoleRanking";

export type TechnicalBucket = "technical" | "non_technical" | "unknown";

export type EnrichedJobCvMatchRow = CvMatchRow & {
  technicalBucket?: TechnicalBucket;
  cvBodyTruncatedForEmbed?: boolean;
  cvDocumentTitleLine?: string;
};

export type JobEmbeddingRankPayload = {
  jobDescriptionId: string;
  job: JobStoredMeta;
  jobTitle: string;
  jobText: string;
  jobRequiresTechnicalOrdering: boolean;
  matches: EnrichedJobCvMatchRow[];
  meta: {
    embeddingModelId: string;
    embeddingIndexModelKey: string;
    embeddingIndexUpdatedAt: string | null;
    embeddingIndexEntryCount: number;
    maxEmbeddingChars: number;
    jobQueryInputTruncated: boolean;
  };
};

function embeddingModelId(): string {
  return (
    process.env.BEDROCK_EMBEDDING_MODEL_ID?.trim() ||
    DEFAULT_BEDROCK_EMBEDDING_MODEL
  );
}

function technicalBucketForRow(
  jobRequiresTechnical: boolean,
  row: CvMatchRow,
  cvMeta: CvStoredMeta | undefined,
  cvText: string | undefined,
): TechnicalBucket | undefined {
  if (!jobRequiresTechnical) return undefined;
  if (row.skipped) return "unknown";
  if (cvIsClearlyNonTechnical(cvMeta, cvText)) return "non_technical";
  return "technical";
}

/**
 * Full embedding rank + transparency fields for one job (shared by API + PDF report).
 */
export async function buildJobEmbeddingRankPayload(
  jobId: string,
): Promise<JobEmbeddingRankPayload> {
  const job = await getJobMeta(jobId);
  if (!job) {
    throw new Error("JOB_NOT_FOUND");
  }
  const jobText = await readJobExtractedText(jobId);
  if (!jobText?.trim()) {
    throw new Error("JOB_TEXT_MISSING");
  }

  const { matches, cvTextById } = await rankCvsAgainstJob(jobId);
  const indexSnap = await readCvEmbeddingIndexSnapshot();
  const cvs = await listCvs();
  const cvMetaById = new Map(cvs.map((c) => [c.id, c]));

  const displayTitle =
    job.titleGuess?.trim() ||
    job.originalName.replace(/\.[^.]+$/, "") ||
    "Job";
  const jobRequiresTechnicalOrdering = jobRequiresTechnicalCandidates(
    job,
    displayTitle,
  );

  const truncatedJobInput = truncateForEmbedding(jobText);
  const jobQueryInputTruncated = truncatedJobInput !== jobText;

  const enriched: EnrichedJobCvMatchRow[] = matches.map((row) => {
    const cvMeta = cvMetaById.get(row.cvId);
    const cvText = cvTextById.get(row.cvId) ?? "";
    const technicalBucket = technicalBucketForRow(
      jobRequiresTechnicalOrdering,
      row,
      cvMeta,
      cvText || undefined,
    );
    const cvBodyTruncatedForEmbed =
      !!cvText && cvText.length > MAX_EMBEDDING_CHARS;
    const cvDocumentTitleLine = cvMeta
      ? cvTitleLineForEmbedding(cvMeta)
      : undefined;

    return {
      ...row,
      technicalBucket,
      cvBodyTruncatedForEmbed,
      cvDocumentTitleLine,
    };
  });

  return {
    jobDescriptionId: jobId,
    job,
    jobTitle: displayTitle,
    jobText,
    jobRequiresTechnicalOrdering,
    matches: enriched,
    meta: {
      embeddingModelId: embeddingModelId(),
      embeddingIndexModelKey: indexSnap.model,
      embeddingIndexUpdatedAt: indexSnap.updatedAt ?? null,
      embeddingIndexEntryCount: indexSnap.entryCount,
      maxEmbeddingChars: MAX_EMBEDDING_CHARS,
      jobQueryInputTruncated,
    },
  };
}
