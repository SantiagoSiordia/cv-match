import { describe, expect, it } from "vitest";
import { parseGeminiJsonText } from "@/lib/gemini";

describe("parseGeminiJsonText", () => {
  it("parses raw JSON", () => {
    const o = parseGeminiJsonText<{ a: number }>('{"a":1}');
    expect(o.a).toBe(1);
  });

  it("parses fenced JSON", () => {
    const o = parseGeminiJsonText<{ name: string }>(
      '```json\n{"name":"Ada"}\n```',
    );
    expect(o.name).toBe("Ada");
  });

  it("extracts first object from leading prose", () => {
    const o = parseGeminiJsonText<{ x: boolean }>(
      'Here you go:\n{"x": true}\nThanks.',
    );
    expect(o.x).toBe(true);
  });
});
