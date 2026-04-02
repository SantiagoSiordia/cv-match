import { jsonError, jsonOk, multipartFileList } from "@/lib/http";
import type { CvStoredMeta } from "@/lib/schemas";
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

function storageErrorStatus(e: StorageError) {
  return e.code === "FILE_TOO_LARGE"
    ? 413
    : e.code === "INVALID_TYPE"
      ? 415
      : 400;
}

export async function POST(request: Request) {
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

    const items: CvStoredMeta[] = [];
    const errors: { fileName: string; code: string; message: string }[] = [];

    for (const file of files) {
      try {
        items.push(await saveCvFromFile(file));
      } catch (e) {
        const fileName = file.name || "unnamed";
        if (e instanceof StorageError) {
          errors.push({ fileName, code: e.code, message: e.message });
        } else {
          errors.push({
            fileName,
            code: "UPLOAD_FAILED",
            message: e instanceof Error ? e.message : "Could not save CV",
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
      const first = errors[0]!;
      return jsonError(
        400,
        "ALL_FAILED",
        errors.length === 1
          ? first.message
          : `All ${errors.length} uploads failed`,
        { errors },
      );
    }

    return jsonOk({ items, errors }, 201);
  } catch (e) {
    if (e instanceof StorageError) {
      return jsonError(storageErrorStatus(e), e.code, e.message);
    }
    console.error(e);
    return jsonError(500, "UPLOAD_FAILED", "Could not save CV");
  }
}
