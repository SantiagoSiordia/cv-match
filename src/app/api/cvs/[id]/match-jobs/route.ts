import { jsonError, jsonOk } from "@/lib/http";
import {
  EmbeddingApiError,
  enrichTopMatchJustifications,
  rankCvAgainstJobs,
} from "@/lib/embeddings";
import { BedrockConfigError } from "@/lib/bedrock";
import { prepareCvForMatch } from "@/lib/storage";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const cv = await prepareCvForMatch(id);
    if (!cv) {
      return jsonError(404, "NOT_FOUND", "CV not found");
    }
    const ranked = await rankCvAgainstJobs(id);
    const items = await enrichTopMatchJustifications(id, ranked);
    return jsonOk({ items, label: "Similarity % (embedding)", cv });
  } catch (e) {
    if (e instanceof Error && e.message === "CV_NOT_FOUND") {
      return jsonError(404, "NOT_FOUND", "CV not found");
    }
    if (e instanceof Error && e.message === "CV_TEXT_MISSING") {
      return jsonError(400, "CV_TEXT_MISSING", "No extractable text for this CV");
    }
    if (e instanceof BedrockConfigError) {
      return jsonError(500, "BEDROCK_CONFIG", e.message);
    }
    if (e instanceof EmbeddingApiError) {
      return jsonError(500, "EMBEDDING_FAILED", e.message);
    }
    console.error(e);
    return jsonError(500, "MATCH_FAILED", "Could not match CV to jobs");
  }
}
