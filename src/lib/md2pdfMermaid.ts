import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class Md2PdfUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Md2PdfUnavailableError";
  }
}

function md2pdfBinary(): string {
  return process.env.MD2PDF_BIN?.trim() || "md2pdf";
}

/**
 * Converts Markdown to PDF using the **md2pdf-mermaid** PyPI package (`md2pdf` on PATH).
 *
 * Install: `pip install md2pdf-mermaid` then `playwright install chromium`.
 * Optional env `MD2PDF_BIN` if `md2pdf` is not on PATH.
 */
export async function renderMarkdownToPdfWithMd2pdf(
  markdown: string,
  options: { title: string },
): Promise<Uint8Array> {
  const cmd = md2pdfBinary();
  const dir = await mkdtemp(join(tmpdir(), "cv-match-md2pdf-"));
  const mdPath = join(dir, "report.md");
  const pdfPath = join(dir, "report.pdf");
  const title = options.title.replace(/[\r\n\u0000]/g, " ").slice(0, 240);

  let stderr = "";
  try {
    await writeFile(mdPath, markdown, "utf8");

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(cmd, [mdPath, "-o", pdfPath, "--title", title, "--page-size", "letter"], {
        cwd: dir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.stdout?.on("data", () => {
        /* md2pdf may log progress */
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        reject(err);
      });
      child.on("close", (code) => {
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) {
      throw new Md2PdfUnavailableError(
        `md2pdf-mermaid failed (exit ${exitCode}). Install: pip install md2pdf-mermaid && playwright install chromium. ` +
          `Set MD2PDF_BIN if md2pdf is not on PATH. Stderr:\n${stderr.slice(0, 4000)}`,
      );
    }

    const buf = await readFile(pdfPath);
    return new Uint8Array(buf);
  } catch (e) {
    if (e instanceof Md2PdfUnavailableError) throw e;
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      throw new Md2PdfUnavailableError(
        `md2pdf executable "${cmd}" not found (ENOENT). Install Python package **md2pdf-mermaid** so the \`md2pdf\` CLI is available, ` +
          `run \`playwright install chromium\`, and ensure the venv \`bin\` is on PATH — or set **MD2PDF_BIN** to the full path of md2pdf.`,
      );
    }
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
