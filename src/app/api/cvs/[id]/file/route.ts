import { readFile } from "node:fs/promises";
import { jsonError } from "@/lib/http";
import { getCvMeta, readCvPdfPath } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const meta = await getCvMeta(id);
  if (!meta) {
    return jsonError(404, "NOT_FOUND", "CV not found");
  }
  const filePath = await readCvPdfPath(id);
  if (!filePath) {
    return jsonError(404, "NOT_FOUND", "CV file missing");
  }
  try {
    const buf = await readFile(filePath);
    const name = meta.originalName?.endsWith(".pdf")
      ? meta.originalName
      : `${meta.originalName || "cv"}.pdf`;
    return new Response(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
      },
    });
  } catch {
    return jsonError(500, "READ_FAILED", "Could not read file");
  }
}
