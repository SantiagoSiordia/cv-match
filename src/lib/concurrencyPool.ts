/**
 * Map with a fixed maximum number of in-flight promises (worker pool).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const limit = Math.max(1, Math.floor(concurrency));
  const out: R[] = new Array(n);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      out[i] = await fn(items[i]!, i);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, n) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}
