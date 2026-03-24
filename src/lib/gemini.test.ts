import { describe, expect, it } from "vitest";
import { GeminiResponseError, parseJsonObject } from "@/lib/gemini";

describe("parseJsonObject", () => {
  it("parses raw JSON", () => {
    expect(parseJsonObject<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    const raw = "```json\n{\"x\": true}\n```";
    expect(parseJsonObject<{ x: boolean }>(raw)).toEqual({ x: true });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonObject("{")).toThrow(GeminiResponseError);
  });
});
