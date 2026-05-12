import { BedrockConfigError } from "@/lib/bedrock";
import { buildAnalyticsReportMarkdown } from "@/lib/analyticsReportMarkdown";
import {
  buildJobCvMatrix,
  readCvEmbeddingIndexSnapshot,
} from "@/lib/embeddings";
import { jsonError } from "@/lib/http";
import {
  Md2PdfUnavailableError,
  renderMarkdownToPdfWithMd2pdf,
} from "@/lib/md2pdfMermaid";
import { listJobDescriptions, readJobExtractedText } from "@/lib/storage";

export const dynamic = "force-dynamic";

function safeReportFileBase(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `analytics-report-${d || "export"}`;
}

export async function GET() {
  try {
    const [matrix, jobs, cvIndex] = await Promise.all([
      buildJobCvMatrix(),
      listJobDescriptions(),
      readCvEmbeddingIndexSnapshot(),
    ]);
    const jobById = new Map(jobs.map((j) => [j.id, j] as const));
    const jobTexts = await Promise.all(
      jobs.map(async (j) => [j.id, (await readJobExtractedText(j.id)) ?? ""] as const),
    );
    const jobTextById = new Map(jobTexts);

    const markdown = buildAnalyticsReportMarkdown({
      matrix,
      jobById,
      jobTextById,
      cvIndex,
    });
    const bytes = await renderMarkdownToPdfWithMd2pdf(markdown, {
      title: "CV-Match — analytics (all roles)",
    });
    const name = `${safeReportFileBase()}.pdf`;
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Md2PdfUnavailableError) {
      return jsonError(503, "MD2PDF_UNAVAILABLE", e.message);
    }
    if (e instanceof BedrockConfigError) {
      return jsonError(500, "AI_CONFIG", e.message);
    }
    console.error(e);
    return jsonError(500, "REPORT_FAILED", "Could not build analytics PDF");
  }
}
