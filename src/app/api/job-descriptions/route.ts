import { jsonError, jsonOk } from "@/lib/http";
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
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return jsonError(400, "MISSING_FILE", 'Expected multipart field "file"');
    }
    const meta = await saveJobDescriptionFromFile(file);
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
    return jsonError(500, "UPLOAD_FAILED", "Could not save job description");
  }
}
