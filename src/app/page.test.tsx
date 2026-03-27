import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { redirect } from "next/navigation";
import Home from "./page";

describe("Home page", () => {
  it("redirects to /evaluate", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/evaluate");
  });
});
