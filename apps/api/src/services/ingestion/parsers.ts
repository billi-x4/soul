/*
 * Document parsers + chunking (US2, FR-008). pdf-parse v2 class API, mammoth for docx, plain
 * decode for txt/md. All parsers are best-effort (return "" on failure, never throw) so one bad
 * file can't break ingestion. Long text is chunked before analyze (relayer guardrails).
 */
import { Buffer } from "node:buffer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function parsePdf(bytes: Uint8Array): Promise<string> {
  try {
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? "";
  } catch {
    return "";
  }
}

export async function parseDocx(bytes: Uint8Array): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value ?? "";
  } catch {
    return "";
  }
}

export function parseTextBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

export async function extractDocument(
  filename: string,
  mime: string,
  bytes: Uint8Array
): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mime.includes("pdf")) {
    return parsePdf(bytes);
  }
  if (lower.endsWith(".docx") || mime.includes("word") || mime.includes("officedocument")) {
    return parseDocx(bytes);
  }
  return parseTextBytes(bytes);
}

/** Split long text into <= maxLen chunks, preferring paragraph boundaries. */
export function chunkText(text: string, maxLen = 4000): string[] {
  const paras = text.split(/\n{2,}/);
  const merged: string[] = [];
  let cur = "";
  for (const p of paras) {
    const candidate = cur ? `${cur}\n\n${p}` : p;
    if (candidate.length > maxLen && cur) {
      merged.push(cur);
      cur = p;
    } else {
      cur = candidate;
    }
  }
  if (cur.trim()) {
    merged.push(cur);
  }
  // Hard-split any segment that itself exceeds maxLen (minified text, single-run PDF/docx
  // extraction with no paragraph boundaries) so the relayer payload guardrail always holds.
  const chunks: string[] = [];
  for (const m of merged) {
    if (m.length <= maxLen) {
      chunks.push(m);
    } else {
      for (let i = 0; i < m.length; i += maxLen) {
        chunks.push(m.slice(i, i + maxLen));
      }
    }
  }
  return chunks;
}
