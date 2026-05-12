import { BedrockConfigError } from "@/lib/bedrock";
import { EmbeddingApiError } from "@/lib/embeddings";
import { buildJobEmbeddingRankPayload } from "@/lib/jobEmbeddingRankPayload";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const payload = await buildJobEmbeddingRankPayload(id);
    return jsonOk({
      jobDescriptionId: payload.jobDescriptionId,
      jobTitle: payload.jobTitle,
      matches: payload.matches,
      meta: payload.meta,
      jobRequiresTechnicalOrdering: payload.jobRequiresTechnicalOrdering,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "JOB_NOT_FOUND") {
      return jsonError(404, "NOT_FOUND", "Job description not found");
    }
    if (e instanceof Error && e.message === "JOB_TEXT_MISSING") {
      return jsonError(400, "JOB_TEXT_MISSING", "No extractable text for this job");
    }
    if (e instanceof BedrockConfigError) {
      return jsonError(500, "AI_CONFIG", e.message);
    }
    if (e instanceof EmbeddingApiError) {
      return jsonError(500, "EMBEDDING_FAILED", e.message);
    }
    console.error(e);
    return jsonError(500, "RANK_FAILED", "Could not compute embedding ranks");
  }
}
