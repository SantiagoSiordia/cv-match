import { jsonError, jsonOk } from "@/lib/http";
import {
  deleteJobDescription,
  getJobMeta,
  readJobExtractedText,
} from "@/lib/storage";

const PREVIEW_CHARS = 8000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const meta = await getJobMeta(id);
    if (!meta) {
      return jsonError(404, "NOT_FOUND", "Job description not found");
    }
    const extracted = await readJobExtractedText(id);
    const extractedPreview =
      extracted && extracted.length > PREVIEW_CHARS
        ? `${extracted.slice(0, PREVIEW_CHARS)}…`
        : extracted ?? "";
    return jsonOk({ item: meta, extractedPreview });
  } catch (e) {
    console.error(e);
    return jsonError(500, "READ_FAILED", "Could not read job description");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const removed = await deleteJobDescription(id);
    if (!removed) {
      return jsonError(404, "NOT_FOUND", "Job description not found");
    }
    return jsonOk({ deleted: true });
  } catch (e) {
    console.error(e);
    return jsonError(500, "DELETE_FAILED", "Could not delete job description");
  }
}
