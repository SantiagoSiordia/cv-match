import { z } from "zod";
import { buildJobCvMatrix } from "@/lib/embeddings";
import { EmbeddingApiError } from "@/lib/embeddings";
import type { BulkEvaluateStreamEvent } from "@/lib/bulkEvaluateStreamEvents";
import { EvaluateError, runEvaluation } from "@/lib/evaluateRun";
import { BedrockConfigError } from "@/lib/bedrock";
import { isAiProviderConfigError } from "@/lib/aiProvider";

const bodySchema = z.object({
  k: z.number().int().min(1).max(20).default(5),
  embeddingFloorPercent: z.number().min(0).max(100).optional().default(0),
});

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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "INVALID_BODY", message: "Invalid request body" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { k, embeddingFloorPercent } = parsed.data;
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
        const matrix = await buildJobCvMatrix();
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

        for (let index = 0; index < matrix.length; index++) {
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
            continue;
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

          try {
            const run = await runEvaluation({
              jobDescriptionId: row.jobDescriptionId,
              cvIds: top.map((t) => t.cvId),
            });
            runs.push({
              jobDescriptionId: row.jobDescriptionId,
              runId: run.id,
            });
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
              continue;
            }
            throw e;
          }
        }

        send({
          type: "complete",
          runs,
          skipped,
          k,
          embeddingFloorPercent,
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
