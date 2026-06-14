/*
 * X / LinkedIn self-import (US2, FR-010/011) — the user's OWN data-export archive (own data only).
 * X export = ZIP of data/*.js (window.YTD-wrapped JSON). LinkedIn export = ZIP of CSVs. Also accepts
 * a plain .json/.txt upload. Defensive: missing/unparsable files are skipped.
 */
import { Buffer } from "node:buffer";
import { parse } from "csv-parse/sync";
import { unzipSync } from "fflate";
import { BadRequestError } from "../../pkg/errors/error";

const isZip = (b: Uint8Array): boolean => b.length > 1 && b[0] === 0x50 && b[1] === 0x4b;

const stripYtd = (js: string): string =>
  js.replace(/^\s*window\.YTD\.[a-zA-Z0-9_]+\.part\d+\s*=\s*/, "");

/** The only archive entries the importer reads — everything else is never inflated. */
const RELEVANT_ENTRY_RE =
  /(tweets?\.js|account\.js|profile\.js|Profile\.csv|Positions\.csv|Education\.csv|Skills\.csv|Shares\.csv)$/i;
/** Zip-bomb guard: a 50MB upload must not be allowed to inflate without bound in memory. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

export async function importSocialArchive(
  platform: "x" | "linkedin",
  bytes: Uint8Array
): Promise<string> {
  if (!isZip(bytes)) {
    const text = Buffer.from(bytes).toString("utf8").trim();
    if (!text) {
      throw new BadRequestError("Empty social import");
    }
    return text;
  }

  let files: Record<string, Uint8Array>;
  try {
    // Inflate ONLY the entries the importer actually reads, and only when their declared
    // decompressed size is sane — a hostile archive can't balloon memory with junk entries.
    files = unzipSync(bytes, {
      filter: (f) => RELEVANT_ENTRY_RE.test(f.name) && f.originalSize <= MAX_ENTRY_BYTES,
    });
  } catch {
    throw new BadRequestError("Could not read the archive (expected a .zip export).");
  }

  const findKey = (re: RegExp): string | undefined => Object.keys(files).find((k) => re.test(k));
  const lines: string[] = [];

  if (platform === "x") {
    for (const re of [/tweets?\.js$/i, /account\.js$/i, /profile\.js$/i]) {
      const key = findKey(re);
      const data = key ? files[key] : undefined;
      if (!data) {
        continue;
      }
      try {
        const arr = JSON.parse(stripYtd(Buffer.from(data).toString("utf8"))) as unknown[];
        for (const item of arr) {
          const t = item as { tweet?: { full_text?: string }; account?: Record<string, unknown> };
          if (t.tweet?.full_text) {
            lines.push(t.tweet.full_text);
          } else if (t.account) {
            lines.push(
              Object.entries(t.account)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(", ")
            );
          }
        }
      } catch {
        /* skip unparsable file */
      }
    }
  } else {
    for (const re of [
      /Profile\.csv$/i,
      /Positions\.csv$/i,
      /Education\.csv$/i,
      /Skills\.csv$/i,
      /Shares\.csv$/i,
    ]) {
      const key = findKey(re);
      const data = key ? files[key] : undefined;
      if (!data) {
        continue;
      }
      try {
        let text = Buffer.from(data).toString("utf8");
        // Some LinkedIn CSVs have preamble lines before the header row.
        const headerIdx = text.search(/First Name|Company Name|School Name|\bName\b|Title/i);
        if (headerIdx > 0) {
          text = text.slice(text.lastIndexOf("\n", headerIdx) + 1);
        }
        const rows = parse(text, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
        }) as Record<string, string>[];
        for (const row of rows) {
          const summary = Object.entries(row)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          if (summary) {
            lines.push(summary);
          }
        }
      } catch {
        /* skip */
      }
    }
  }

  if (lines.length === 0) {
    throw new BadRequestError("No recognizable data found in the export archive.");
  }
  return lines.join("\n");
}
