import { BedrockConfigError } from "@/lib/bedrock";
import { buildJobComparisonReportMarkdown } from "@/lib/jobComparisonReportMarkdown";
import { EmbeddingApiError } from "@/lib/embeddings";
import { buildJobEmbeddingRankPayload } from "@/lib/jobEmbeddingRankPayload";
import { jsonError } from "@/lib/http";
import {
  Md2PdfUnavailableError,
  renderMarkdownToPdfWithMd2pdf,
} from "@/lib/md2pdfMermaid";

function safeReportFileBase(title: string): string {
  const base = title
    .replace(/\.[^.]+$/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
    .trim();
  return base.length ? base : "job-comparison";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const payload = await buildJobEmbeddingRankPayload(id);
    const markdown = buildJobComparisonReportMarkdown(payload);
    const bytes = await renderMarkdownToPdfWithMd2pdf(markdown, {
      title: `CV-Match: ${payload.jobTitle}`,
    });
    const name = `${safeReportFileBase(payload.jobTitle)}.pdf`;
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "JOB_NOT_FOUND") {
      return jsonError(404, "NOT_FOUND", "Job description not found");
    }
    if (e instanceof Error && e.message === "JOB_TEXT_MISSING") {
      return jsonError(400, "JOB_TEXT_MISSING", "No extractable text for this job");
    }
    if (e instanceof Md2PdfUnavailableError) {
      return jsonError(503, "MD2PDF_UNAVAILABLE", e.message);
    }
    if (e instanceof BedrockConfigError) {
      return jsonError(500, "AI_CONFIG", e.message);
    }
    if (e instanceof EmbeddingApiError) {
      return jsonError(500, "EMBEDDING_FAILED", e.message);
    }
    console.error(e);
    return jsonError(500, "REPORT_FAILED", "Could not build comparison PDF");
  }
}
