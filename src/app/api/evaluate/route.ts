import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { EvaluateError, runEvaluation } from "@/lib/evaluateRun";

const bodySchema = z.object({
  jobDescriptionId: z.string().uuid(),
  cvIds: z.array(z.string().uuid()).min(1),
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

  try {
    const run = await runEvaluation(parsed.data);
    return jsonOk({ run }, 201);
  } catch (e) {
    if (e instanceof EvaluateError) {
      return jsonError(e.status, e.code, e.message);
    }
    console.error(e);
    return jsonError(500, "EVALUATE_FAILED", "Evaluation failed");
  }
}
