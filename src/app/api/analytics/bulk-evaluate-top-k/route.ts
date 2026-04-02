import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { buildJobCvMatrix } from "@/lib/embeddings";
import { EvaluateError, runEvaluation } from "@/lib/evaluateRun";
import { BedrockConfigError } from "@/lib/bedrock";
import { isAiProviderConfigError } from "@/lib/aiProvider";
import { EmbeddingApiError } from "@/lib/embeddings";

const bodySchema = z.object({
  k: z.number().int().min(1).max(20).default(5),
  embeddingFloorPercent: z.number().min(0).max(100).optional().default(0),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be JSON");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "INVALID_BODY", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  const { k, embeddingFloorPercent } = parsed.data;

  try {
    const matrix = await buildJobCvMatrix();
    const runs: Array<{ jobDescriptionId: string; runId: string }> = [];
    const skipped: Array<{ jobDescriptionId: string; reason: string }> = [];

    for (const row of matrix) {
      const top = row.matches
        .filter((m) => !m.skipped && m.scorePercent >= embeddingFloorPercent)
        .slice(0, k);
      if (top.length === 0) {
        skipped.push({
          jobDescriptionId: row.jobDescriptionId,
          reason: "no_candidates_above_floor",
        });
        continue;
      }
      try {
        const run = await runEvaluation({
          jobDescriptionId: row.jobDescriptionId,
          cvIds: top.map((t) => t.cvId),
        });
        runs.push({
          jobDescriptionId: row.jobDescriptionId,
          runId: run.id,
        });
      } catch (e) {
        if (e instanceof EvaluateError) {
          skipped.push({
            jobDescriptionId: row.jobDescriptionId,
            reason: e.message,
          });
          continue;
        }
        throw e;
      }
    }

    return jsonOk({ runs, skipped, k, embeddingFloorPercent }, 201);
  } catch (e) {
    if (e instanceof EvaluateError) {
      return jsonError(e.status, e.code, e.message);
    }
    if (isAiProviderConfigError(e) || e instanceof BedrockConfigError) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonError(500, "AI_CONFIG", msg);
    }
    if (e instanceof EmbeddingApiError) {
      return jsonError(500, "EMBEDDING_FAILED", e.message);
    }
    console.error(e);
    return jsonError(500, "BULK_EVAL_FAILED", "Bulk evaluation failed");
  }
}
