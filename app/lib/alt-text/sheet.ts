// The owner's rating sheet (Q-26): a fixed-seed random sample of drafts as
// CSV. The rubric is in docs/spikes/alt-text-rating-sheet.md.
import type { ReviewDraft } from "./types";

export const SHEET_SIZE = 50;
export const SHEET_SEED = 20261008;

export const SHEET_COLUMNS = [
  "sample",
  "media ID",
  "image URL",
  "product title",
  "draft",
  "rating 1 to 5",
  "accurate yes/no",
  "would publish yes/no",
  "notes",
] as const;

/** Small seeded PRNG (mulberry32). Same seed, same sequence, on any machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks n rows with a partial Fisher-Yates shuffle. Returns all rows, shuffled, if there are fewer than n. */
export function seededSample<T>(rows: T[], n: number, seed: number): T[] {
  const copy = rows.slice();
  const rand = mulberry32(seed);
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, take);
}

// Spreadsheet apps run cells that start with these as formulas, also after
// leading spaces (NBSP included) and in full-width form. Store text is
// untrusted, so such cells get a leading apostrophe.
const FORMULA_START = /^\s*[=+\-@＝＋－＠]|^[\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV with a UTF-8 byte order mark and CRLF line ends, so Excel and Sheets both read accents correctly. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export interface RatingSheet {
  csv: string;
  sampled: ReviewDraft[];
  /** Drafts the sample was drawn from: every draft with text. */
  poolSize: number;
}

/**
 * Samples drafts with text (decorative images, which have empty alt, are not
 * rated). The pool is sorted by media ID first, so the sample does not depend
 * on the order the Batch API returned results in.
 */
export function ratingSheet(drafts: ReviewDraft[], size = SHEET_SIZE, seed = SHEET_SEED): RatingSheet {
  const pool = drafts
    .filter((d) => d.draft.trim().length > 0)
    .sort((a, b) => (a.mediaId < b.mediaId ? -1 : a.mediaId > b.mediaId ? 1 : 0));
  const sampled = seededSample(pool, size, seed);
  const rows = [
    [...SHEET_COLUMNS],
    ...sampled.map((d, i) => [String(i + 1), d.mediaId, d.imageUrl, d.productTitle, d.draft, "", "", "", ""]),
  ];
  return { csv: toCsv(rows), sampled, poolSize: pool.length };
}

/** Checks a results.jsonl row is a review draft the sheet can use. */
export function isReviewDraft(row: unknown): row is ReviewDraft {
  const r = row as Record<string, unknown>;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.mediaId === "string" &&
    typeof r.imageUrl === "string" &&
    typeof r.productTitle === "string" &&
    typeof r.draft === "string"
  );
}
