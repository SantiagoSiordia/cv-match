import { buildJobCvMatrix } from "@/lib/embeddings";
import { EmbeddingApiError } from "@/lib/embeddings";
import type { BulkEvaluateStreamEvent } from "@/lib/bulkEvaluateStreamEvents";
import {
  bulkEvaluateTopKBodySchema,
  resolveBulkJobConcurrency,
} from "@/lib/bulkEvaluateTopKSchema";
import { mapWithConcurrency } from "@/lib/concurrencyPool";
import { EvaluateError, runEvaluation } from "@/lib/evaluateRun";
import { BedrockConfigError } from "@/lib/bedrock";
import { isAiProviderConfigError } from "@/lib/aiProvider";
import {
  listEvaluationRuns,
  runMatchesOrderedCvIds,
} from "@/lib/evaluationsStore";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "INVALID_JSON", message: "Body must be JSON" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const parsed = bulkEvaluateTopKBodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "INVALID_BODY", message: "Invalid request body" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    k,
    embeddingFloorPercent,
    skipIfUnchanged,
    useBatchedCompatibility,
  } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: BulkEvaluateStreamEvent) => {
        controller.enqueue(
          encoder.encode(`${JSON.stringify(event)}\n`),
        );
      };

      try {
        send({ type: "matrix" });
        const tMatrix0 =
          process.env.EVALUATE_LOG_TIMING?.trim() === "1"
            ? Date.now()
            : 0;
        const matrix = await buildJobCvMatrix();
        if (tMatrix0) {
          console.log(
            JSON.stringify({
              source: "bulk_eval",
              event: "matrix_built",
              jobCount: matrix.length,
              ms: Date.now() - tMatrix0,
            }),
          );
        }
        send({
          type: "ready",
          total: matrix.length,
          jobs: matrix.map((r) => ({
            jobDescriptionId: r.jobDescriptionId,
            jobTitle: r.jobTitle,
          })),
        });

        const runs: Array<{ jobDescriptionId: string; runId: string }> = [];
        const skipped: Array<{ jobDescriptionId: string; reason: string }> =
          [];

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
            .filter(
              (m) => !m.skipped && m.scorePercent >= embeddingFloorPercent,
            )
            .slice(0, k);

          if (top.length === 0) {
            send({
              type: "job",
              index,
              total: matrix.length,
              jobDescriptionId: row.jobDescriptionId,
              jobTitle: row.jobTitle,
              status: "skipped",
              reason: "no_candidates_above_floor",
            });
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
              send({
                type: "job",
                index,
                total: matrix.length,
                jobDescriptionId: row.jobDescriptionId,
                jobTitle: row.jobTitle,
                status: "skipped",
                reason: "unchanged_since_last_run",
                cvCount: top.length,
                existingRunId: latest!.id,
              });
              skipped.push({
                jobDescriptionId: row.jobDescriptionId,
                reason: "unchanged_since_last_run",
              });
              return;
            }
          }

          send({
            type: "job",
            index,
            total: matrix.length,
            jobDescriptionId: row.jobDescriptionId,
            jobTitle: row.jobTitle,
            status: "running",
            cvCount: top.length,
          });

          const tJob0 =
            process.env.EVALUATE_LOG_TIMING?.trim() === "1"
              ? Date.now()
              : 0;

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
            if (tJob0) {
              console.log(
                JSON.stringify({
                  source: "bulk_eval",
                  event: "job_eval_wall_ms",
                  jobDescriptionId: row.jobDescriptionId,
                  cvCount: top.length,
                  batched: useBatchedCompatibility,
                  ms: Date.now() - tJob0,
                }),
              );
            }
            send({
              type: "job",
              index,
              total: matrix.length,
              jobDescriptionId: row.jobDescriptionId,
              jobTitle: row.jobTitle,
              status: "done",
              runId: run.id,
              cvCount: top.length,
            });
          } catch (e) {
            if (e instanceof EvaluateError) {
              const reason = e.message;
              skipped.push({
                jobDescriptionId: row.jobDescriptionId,
                reason,
              });
              send({
                type: "job",
                index,
                total: matrix.length,
                jobDescriptionId: row.jobDescriptionId,
                jobTitle: row.jobTitle,
                status: "error",
                reason,
                cvCount: top.length,
              });
              return;
            }
            throw e;
          }
        });

        send({
          type: "complete",
          runs,
          skipped,
          k,
          embeddingFloorPercent,
          skipIfUnchanged,
          useBatchedCompatibility,
        });
      } catch (e) {
        if (e instanceof EvaluateError) {
          send({
            type: "fatal",
            code: e.code,
            message: e.message,
            status: e.status,
          });
        } else if (
          isAiProviderConfigError(e) ||
          e instanceof BedrockConfigError
        ) {
          send({
            type: "fatal",
            code: "AI_CONFIG",
            message: e instanceof Error ? e.message : String(e),
            status: 500,
          });
        } else if (e instanceof EmbeddingApiError) {
          send({
            type: "fatal",
            code: "EMBEDDING_FAILED",
            message: e.message,
            status: 500,
          });
        } else {
          console.error(e);
          send({
            type: "fatal",
            code: "BULK_EVAL_FAILED",
            message: "Bulk evaluation failed",
            status: 500,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
