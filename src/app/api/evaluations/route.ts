import { jsonError, jsonOk } from "@/lib/http";
import { listEvaluationRuns } from "@/lib/evaluationsStore";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobDescriptionId") ?? undefined;
  const validJobId =
    jobId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      jobId,
    )
      ? jobId
      : undefined;

  try {
    const runs = await listEvaluationRuns(validJobId);
    return jsonOk({ runs });
  } catch (e) {
    console.error(e);
    return jsonError(500, "LIST_FAILED", "Could not list evaluations");
  }
}
