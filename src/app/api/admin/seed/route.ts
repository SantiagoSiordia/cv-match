import {
  parseSeedMaxCvFilesRequest,
  parseSeedMaxJdLinesRequest,
  runFullSeed,
} from "@/lib/fullSeed";

export const maxDuration = 3600;

function badConfirmResponse() {
  return Response.json(
    {
      ok: false as const,
      error: {
        code: "BAD_CONFIRM",
        message:
          'Send JSON body { "confirm": "DELETE" } to run the destructive seed.',
      },
    },
    { status: 400 },
  );
}

export async function GET() {
  return Response.json(
    {
      ok: false as const,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message:
          'Use POST with JSON body { "confirm": "DELETE", "maxCvFiles"?: number, "maxJdLines"?: number } to start seeding.',
      },
    },
    { status: 405 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badConfirmResponse();
  }
  const confirm =
    body &&
    typeof body === "object" &&
    "confirm" in body &&
    typeof (body as { confirm?: unknown }).confirm === "string"
      ? (body as { confirm: string }).confirm.trim()
      : "";
  if (confirm !== "DELETE") {
    return badConfirmResponse();
  }

  const rawMax =
    body && typeof body === "object" && "maxCvFiles" in body
      ? (body as { maxCvFiles?: unknown }).maxCvFiles
      : undefined;
  const maxParsed = parseSeedMaxCvFilesRequest(rawMax);
  if (!maxParsed.ok) {
    return Response.json(
      {
        ok: false as const,
        error: { code: "BAD_MAX_CV_FILES", message: maxParsed.message },
      },
      { status: 400 },
    );
  }
  const maxCvFiles = maxParsed.value;

  const rawMaxJd =
    body && typeof body === "object" && "maxJdLines" in body
      ? (body as { maxJdLines?: unknown }).maxJdLines
      : undefined;
  const jdParsed = parseSeedMaxJdLinesRequest(rawMaxJd);
  if (!jdParsed.ok) {
    return Response.json(
      {
        ok: false as const,
        error: { code: "BAD_MAX_JD_LINES", message: jdParsed.message },
      },
      { status: 400 },
    );
  }
  const maxJdLines = jdParsed.value;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runFullSeed(
          (e) => {
            controller.enqueue(
              encoder.encode(`${JSON.stringify(e)}\n`),
            );
          },
          { maxCvFiles, maxJdLines },
        );
      } catch {
        /* runFullSeed emits phase "error" before rethrowing */
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
