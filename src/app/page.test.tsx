import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("links to main sections", () => {
    render(<Home />);
    const byHref = (href: string) =>
      document.querySelector(`a[href="${href}"]`) as HTMLAnchorElement;
    expect(byHref("/cvs")).toBeTruthy();
    expect(byHref("/job-descriptions")).toBeTruthy();
    expect(byHref("/evaluate")).toBeTruthy();
    expect(byHref("/dashboard")).toBeTruthy();
  });
});
