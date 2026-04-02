import { AsyncSemaphore } from "@/lib/asyncSemaphore";

let cached: AsyncSemaphore | null | undefined;

/**
 * Shared cap on concurrent compatibility LLM calls during bulk evaluate.
 * Set `BULK_LLM_GLOBAL_CONCURRENCY` to a positive integer (default 4).
 * Set to `0` or empty disable to turn off global limiting (per-job cv concurrency only).
 */
export function getBulkLlmGlobalSemaphore(): AsyncSemaphore | null {
  if (cached !== undefined) return cached;
  const raw = process.env.BULK_LLM_GLOBAL_CONCURRENCY?.trim();
  if (raw === "" || raw === "0") {
    cached = null;
    return cached;
  }
  const n = raw === undefined ? 4 : parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    cached = new AsyncSemaphore(4);
    return cached;
  }
  cached = new AsyncSemaphore(Math.min(64, n));
  return cached;
}
