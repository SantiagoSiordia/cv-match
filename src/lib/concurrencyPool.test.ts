import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrencyPool";

describe("mapWithConcurrency", () => {
  it("returns empty for empty input", async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
  });

  it("preserves order with concurrency 1", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 1, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6]);
  });

  it("preserves order with high concurrency", async () => {
    const out = await mapWithConcurrency(
      ["a", "b", "c", "d"],
      4,
      async (s, i) => `${s}${i}`,
    );
    expect(out).toEqual(["a0", "b1", "c2", "d3"]);
  });

  it("coerces concurrency below 1 to 1", async () => {
    let maxSim = 0;
    let cur = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 0, async (n) => {
      cur++;
      maxSim = Math.max(maxSim, cur);
      await new Promise((r) => setTimeout(r, 5));
      cur--;
      return n;
    });
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(maxSim).toBe(1);
  });
});
