import { buildAnalyticsCandidatesCsvString } from "@/lib/analytics";
import { buildAnalyticsCandidatesXlsxBuffer } from "@/lib/analyticsCandidatesXlsx";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

function safeExportFilename(isoDate: string, ext: "csv" | "xlsx"): string {
  const d = isoDate.slice(0, 10).replace(/-/g, "");
  return `analytics-candidates-${d || "export"}.${ext}`;
}

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  try {
    if (format === "csv") {
      const { csv, generatedAt } = await buildAnalyticsCandidatesCsvString();
      const name = safeExportFilename(generatedAt, "csv");
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format !== "xlsx") {
      return jsonError(400, "BAD_FORMAT", 'Use format=csv or format=xlsx (default is xlsx).');
    }

    const { buffer, generatedAt } = await buildAnalyticsCandidatesXlsxBuffer();
    const name = safeExportFilename(generatedAt, "xlsx");
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return jsonError(
      500,
      "EXPORT_FAILED",
      e instanceof Error ? e.message : "Could not build candidates export",
    );
  }
}
