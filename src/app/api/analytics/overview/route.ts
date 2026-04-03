import { jsonError, jsonOk } from "@/lib/http";
import { computeAnalyticsOverview } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const emb = Number(url.searchParams.get("embeddingThreshold") ?? "55");
  const llm = Number(url.searchParams.get("llmThreshold") ?? "75");
  const embeddingThreshold = Number.isFinite(emb) ? Math.min(100, Math.max(0, emb)) : 55;
  const llmThreshold = Number.isFinite(llm) ? Math.min(100, Math.max(0, llm)) : 75;

  try {
    const overview = await computeAnalyticsOverview({
      thresholdEmbeddingPercent: embeddingThreshold,
      thresholdLlmOverall: llmThreshold,
    });
    return jsonOk({ overview });
  } catch (e) {
    console.error(e);
    return jsonError(
      500,
      "ANALYTICS_FAILED",
      e instanceof Error ? e.message : "Analytics failed",
    );
  }
}
