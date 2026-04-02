import { jsonError, jsonOk } from "@/lib/http";
import { buildJobCvMatrix } from "@/lib/embeddings";
import { EvaluateError, runEvaluation } from "@/lib/evaluateRun";
import { BedrockConfigError } from "@/lib/bedrock";
import { isAiProviderConfigError } from "@/lib/aiProvider";
import { EmbeddingApiError } from "@/lib/embeddings";
import {
  bulkEvaluateTopKBodySchema,
  resolveBulkJobConcurrency,
} from "@/lib/bulkEvaluateTopKSchema";
import { mapWithConcurrency } from "@/lib/concurrencyPool";
import {
  listEvaluationRuns,
  runMatchesOrderedCvIds,
} from "@/lib/evaluationsStore";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be JSON");
  }

  const parsed = bulkEvaluateTopKBodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "INVALID_BODY", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  const {
    k,
    embeddingFloorPercent,
    skipIfUnchanged,
    useBatchedCompatibility,
  } = parsed.data;

  try {
    const matrix = await buildJobCvMatrix();
    const runs: Array<{ jobDescriptionId: string; runId: string }> = [];
    const skipped: Array<{ jobDescriptionId: string; reason: string }> = [];

    const allRuns = skipIfUnchanged ? await listEvaluationRuns() : [];
    const runOpts = {
      useGlobalLlmSlot: true as const,
      useBatchedCompatibility,
    };
    const jobConc = resolveBulkJobConcurrency();
    const indices = matrix.map((_, i) => i);

    await mapWithConcurrency(indices, jobConc, async (index) => {
      const row = matrix[index]!;
      const top = row.matches
        .filter((m) => !m.skipped && m.scorePercent >= embeddingFloorPercent)
        .slice(0, k);
      if (top.length === 0) {
        skipped.push({
          jobDescriptionId: row.jobDescriptionId,
          reason: "no_candidates_above_floor",
        });
        return;
      }

      const cvIds = top.map((t) => t.cvId);

      if (skipIfUnchanged) {
        const latest = allRuns.find(
          (r) => r.jobDescriptionId === row.jobDescriptionId,
        );
        if (runMatchesOrderedCvIds(latest, cvIds)) {
          skipped.push({
            jobDescriptionId: row.jobDescriptionId,
            reason: "unchanged_since_last_run",
          });
          return;
        }
      }

      try {
        const run = await runEvaluation(
          {
            jobDescriptionId: row.jobDescriptionId,
            cvIds,
          },
          runOpts,
        );
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
          return;
        }
        throw e;
      }
    });

    return jsonOk(
      {
        runs,
        skipped,
        k,
        embeddingFloorPercent,
        skipIfUnchanged,
        useBatchedCompatibility,
      },
      201,
    );
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
