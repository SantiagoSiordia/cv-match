import { NextResponse } from "next/server";

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { ok: false as const, error: { code, message, ...details } },
    { status },
  );
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true as const, data }, { status });
}

/**
 * Collects uploads from `files` (repeatable) or a single `file` (backward compatible).
 */
export function multipartFileList(formData: FormData): File[] {
  const fromFiles = formData
    .getAll("files")
    .filter((v): v is File => v instanceof File);
  if (fromFiles.length > 0) return fromFiles;
  const one = formData.get("file");
  return one instanceof File ? [one] : [];
}
