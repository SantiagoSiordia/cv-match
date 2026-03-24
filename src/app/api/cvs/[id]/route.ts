import { jsonError, jsonOk } from "@/lib/http";
import {
  deleteCv,
  getCvMeta,
  readCvExtractedText,
} from "@/lib/storage";

const PREVIEW_CHARS = 8000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const meta = await getCvMeta(id);
    if (!meta) {
      return jsonError(404, "NOT_FOUND", "CV not found");
    }
    const extracted = await readCvExtractedText(id);
    const extractedPreview =
      extracted && extracted.length > PREVIEW_CHARS
        ? `${extracted.slice(0, PREVIEW_CHARS)}…`
        : extracted ?? "";
    return jsonOk({ item: meta, extractedPreview });
  } catch (e) {
    console.error(e);
    return jsonError(500, "READ_FAILED", "Could not read CV");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const removed = await deleteCv(id);
    if (!removed) {
      return jsonError(404, "NOT_FOUND", "CV not found");
    }
    return jsonOk({ deleted: true });
  } catch (e) {
    console.error(e);
    return jsonError(500, "DELETE_FAILED", "Could not delete CV");
  }
}
