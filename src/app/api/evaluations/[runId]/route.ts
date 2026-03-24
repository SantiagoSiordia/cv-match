import { jsonError, jsonOk } from "@/lib/http";
import { getEvaluationRun } from "@/lib/evaluationsStore";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  try {
    const run = await getEvaluationRun(runId);
    if (!run) {
      return jsonError(404, "NOT_FOUND", "Evaluation run not found");
    }
    return jsonOk({ run });
  } catch (e) {
    console.error(e);
    return jsonError(500, "READ_FAILED", "Could not read evaluation");
  }
}
