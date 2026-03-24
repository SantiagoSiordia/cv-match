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
