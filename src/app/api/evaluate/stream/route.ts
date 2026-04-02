import { z } from "zod";
import {
  EvaluateError,
  runEvaluationStreaming,
  type EvaluateStreamEvent,
} from "@/lib/evaluateRun";

const bodySchema = z.object({
  jobDescriptionId: z.string().uuid(),
  cvIds: z.array(z.string().uuid()).min(1),
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: EvaluateStreamEvent) => {
        controller.enqueue(
          encoder.encode(`${JSON.stringify(event)}\n`),
        );
      };
      try {
        await runEvaluationStreaming(parsed.data, send);
      } catch (e) {
        if (e instanceof EvaluateError) {
          send({
            type: "fatal",
            code: e.code,
            message: e.message,
            status: e.status,
          });
        } else {
          console.error(e);
          send({
            type: "fatal",
            code: "EVALUATE_FAILED",
            message: "Evaluation failed",
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
