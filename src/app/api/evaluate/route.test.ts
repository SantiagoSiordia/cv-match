/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/evaluate", () => {
  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when cvIds is empty", async () => {
    const res = await POST(
      new Request("http://localhost/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescriptionId: "00000000-0000-4000-8000-000000000001",
          cvIds: [],
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
