/**
 * @vitest-environment node
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/extractText", () => ({
  extractTextFromPdf: vi.fn(async () => "Extracted CV text for testing."),
  extractTextFromPlainBuffer: (b: Buffer) => b.toString("utf8"),
}));

vi.mock("@/lib/aiProvider", () => ({
  AiProviderConfigError: class AiProviderConfigError extends Error {},
  GeminiConfigError: class GeminiConfigError extends Error {},
  extractCvMetadataWithProvider: vi.fn(async () => ({
    name: "Test Candidate",
    skills: ["Testing"],
    experienceSummary: "Several years of testing.",
  })),
  guessJobTitleWithProvider: vi.fn(async () => "QA Engineer"),
}));

describe("storage (isolated cwd)", () => {
  let prevCwd: string;
  let tempDir: string;
  let prevAwsRegion: string | undefined;

  beforeEach(async () => {
    prevCwd = process.cwd();
    prevAwsRegion = process.env.AWS_REGION;
    tempDir = await mkdtemp(path.join(tmpdir(), "cv-match-test-"));
    process.chdir(tempDir);
    process.env.AWS_REGION = "us-east-1";
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (prevAwsRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = prevAwsRegion;
  });

  it("saves a CV PDF and writes meta + extracted sidecar", async () => {
    const { saveCvFromFile } = await import("@/lib/storage");
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const file = new File([pdfBytes], "resume.pdf", {
      type: "application/pdf",
    });

    const meta = await saveCvFromFile(file);

    expect(meta.type).toBe("cv");
    expect(meta.originalName).toBe("resume.pdf");

    const extracted = await readFile(
      path.join(tempDir, "cvs-extracted", `${meta.id}.extracted.txt`),
      "utf8",
    );
    expect(extracted).toContain("Extracted CV text");

    const metaRaw = await readFile(
      path.join(tempDir, "cvs-meta", `${meta.id}.meta.json`),
      "utf8",
    );
    expect(metaRaw).toContain("Test Candidate");
  });

  it("rejects non-PDF CV uploads", async () => {
    const { saveCvFromFile, StorageError } = await import("@/lib/storage");
    const file = new File([new Uint8Array([1, 2, 3])], "x.txt", {
      type: "text/plain",
    });
    await expect(saveCvFromFile(file)).rejects.toBeInstanceOf(StorageError);
  });
});
