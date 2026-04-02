import { BedrockResponseError } from "@/lib/bedrock";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function llmRetryMaxAttempts(): number {
  const raw = process.env.LLM_THROTTLE_MAX_RETRIES?.trim();
  const n = raw ? parseInt(raw, 10) : 6;
  if (!Number.isFinite(n) || n < 1) return 6;
  return Math.min(12, n);
}

/**
 * True for rate limits / transient overload we should retry (Bedrock + generic messages).
 */
export function isRetryableLlmThrottleError(e: unknown): boolean {
  if (e instanceof BedrockResponseError) {
    return isRetryableLlmThrottleMessage(e.message);
  }
  if (!(e instanceof Error)) return false;
  return isRetryableLlmThrottleMessage(e.message);
}

function isRetryableLlmThrottleMessage(msg: string): boolean {
  return /throttl|too many requests|429|rate exceed|quota|capacity|503|502|504|overloaded|try again|timeout|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
    msg,
  );
}

/**
 * Retries fn on likely rate-limit / transient errors (exponential backoff + jitter).
 * Gemini text calls already retry internally; this layer helps Bedrock and cross-provider paths.
 */
export async function withLlmThrottleRetries<T>(fn: () => Promise<T>): Promise<T> {
  const max = llmRetryMaxAttempts();
  let last: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryableLlmThrottleError(e) || attempt === max - 1) {
        throw e;
      }
      const base = Math.min(16_000, 600 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 400);
      await sleep(base + jitter);
    }
  }
  throw last;
}
