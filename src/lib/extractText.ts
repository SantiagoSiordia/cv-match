import { PDFParse } from "pdf-parse";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const textResult = await parser.getText();
    const text = (textResult.text ?? "").replace(/\u0000/g, "").trim();
    return text;
  } finally {
    await parser.destroy();
  }
}

export function extractTextFromPlainBuffer(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/\u0000/g, "").trim();
}
