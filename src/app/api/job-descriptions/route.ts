import { jsonError, jsonOk, multipartFileList } from "@/lib/http";
import type { JobStoredMeta } from "@/lib/schemas";
import {
  listJobDescriptions,
  saveJobDescriptionFromFile,
  saveJobDescriptionFromText,
  StorageError,
} from "@/lib/storage";

export async function GET() {
  try {
    const items = await listJobDescriptions();
    return jsonOk({ items });
  } catch (e) {
    console.error(e);
    return jsonError(500, "LIST_FAILED", "Could not list job descriptions");
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as {
        title?: string;
        text?: string;
      };
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : "Job description";
      const text =
        typeof body.text === "string" && body.text.trim()
          ? body.text.trim()
          : "";
      if (!text) {
        return jsonError(400, "INVALID_BODY", "text is required");
      }
      const meta = await saveJobDescriptionFromText(title, text);
      return jsonOk({ item: meta }, 201);
    } catch (e) {
      if (e instanceof StorageError) {
        const status =
          e.code === "FILE_TOO_LARGE"
            ? 413
            : e.code === "INVALID_TYPE"
              ? 415
              : 400;
        return jsonError(status, e.code, e.message);
      }
      console.error(e);
      return jsonError(500, "CREATE_FAILED", "Could not create job description");
    }
  }

  try {
    const formData = await request.formData();
    const files = multipartFileList(formData);
    if (files.length === 0) {
      return jsonError(
        400,
        "MISSING_FILE",
        'Expected multipart field "file" or one or more "files"',
      );
    }

    const items: JobStoredMeta[] = [];
    const errors: { fileName: string; code: string; message: string }[] = [];

    for (const file of files) {
      try {
        items.push(await saveJobDescriptionFromFile(file));
      } catch (e) {
        const fileName = file.name || "unnamed";
        if (e instanceof StorageError) {
          errors.push({ fileName, code: e.code, message: e.message });
        } else {
          errors.push({
            fileName,
            code: "UPLOAD_FAILED",
            message:
              e instanceof Error ? e.message : "Could not save job description",
          });
        }
      }
    }

    if (files.length === 1) {
      if (items.length === 1) {
        return jsonOk({ item: items[0]! }, 201);
      }
      const er = errors[0]!;
      const status =
        er.code === "FILE_TOO_LARGE"
          ? 413
          : er.code === "INVALID_TYPE"
            ? 415
            : 400;
      return jsonError(status, er.code, er.message);
    }

    if (items.length === 0) {
      return jsonError(
        400,
        "ALL_FAILED",
        errors.length === 1
          ? errors[0]!.message
          : `All ${errors.length} uploads failed`,
        { errors },
      );
    }

    return jsonOk({ items, errors }, 201);
  } catch (e) {
    if (e instanceof StorageError) {
      const status =
        e.code === "FILE_TOO_LARGE"
          ? 413
          : e.code === "INVALID_TYPE"
            ? 415
            : 400;
      return jsonError(status, e.code, e.message);
    }
    console.error(e);
    return jsonError(500, "UPLOAD_FAILED", "Could not save job description");
  }
}
