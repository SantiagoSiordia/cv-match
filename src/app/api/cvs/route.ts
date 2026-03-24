import { jsonError, jsonOk } from "@/lib/http";
import { listCvs, saveCvFromFile, StorageError } from "@/lib/storage";

export async function GET() {
  try {
    const items = await listCvs();
    return jsonOk({ items });
  } catch (e) {
    console.error(e);
    return jsonError(500, "LIST_FAILED", "Could not list CVs");
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return jsonError(400, "MISSING_FILE", 'Expected multipart field "file"');
    }
    const meta = await saveCvFromFile(file);
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
    return jsonError(500, "UPLOAD_FAILED", "Could not save CV");
  }
}
