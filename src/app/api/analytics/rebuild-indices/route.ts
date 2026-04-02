import { jsonError, jsonOk } from "@/lib/http";
import {
  EmbeddingApiError,
  ensureCvEmbeddingIndex,
  ensureJobEmbeddingIndex,
  readCvEmbeddingIndexSnapshot,
} from "@/lib/embeddings";
import { BedrockConfigError } from "@/lib/bedrock";
import { isAiProviderConfigError } from "@/lib/aiProvider";

export async function POST() {
  try {
    await ensureJobEmbeddingIndex();
    await ensureCvEmbeddingIndex();
    const cv = await readCvEmbeddingIndexSnapshot();
    return jsonOk({
      rebuilt: true,
      cvEmbeddingIndex: cv,
    });
  } catch (e) {
    if (isAiProviderConfigError(e) || e instanceof BedrockConfigError) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonError(500, "AI_CONFIG", msg);
    }
    if (e instanceof EmbeddingApiError) {
      return jsonError(500, "EMBEDDING_FAILED", e.message);
    }
    console.error(e);
    return jsonError(500, "REBUILD_FAILED", "Could not rebuild embedding indices");
  }
}
