import { readFile } from "node:fs/promises";
import { jsonError } from "@/lib/http";
import { getJobMeta, readJobFilePath } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const meta = await getJobMeta(id);
  if (!meta) {
    return jsonError(404, "NOT_FOUND", "Job description not found");
  }
  const filePath = await readJobFilePath(id);
  if (!filePath) {
    return jsonError(404, "NOT_FOUND", "File missing");
  }
  try {
    const buf = await readFile(filePath);
    const isPdf = meta.mimeType === "application/pdf";
    const isJson = meta.mimeType === "application/json";
    const contentType = isPdf
      ? "application/pdf"
      : isJson
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8";
    const fallbackName = isPdf
      ? "job-description.pdf"
      : isJson
        ? "job-description.json"
        : "job-description.txt";
    const name = meta.originalName || fallbackName;
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch {
    return jsonError(500, "READ_FAILED", "Could not read file");
  }
}
