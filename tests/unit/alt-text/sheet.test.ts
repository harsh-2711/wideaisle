import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHEET_COLUMNS, SHEET_SEED, csvCell, mulberry32, ratingSheet, seededSample, toCsv } from "../../../app/lib/alt-text/sheet";
import type { ReviewDraft } from "../../../app/lib/alt-text/types";
import { tempDir } from "./mock-client";

function draft(n: number, text = `Blue shoe ${n}`): ReviewDraft {
  return {
    mediaId: `gid://shopify/MediaImage/${String(n).padStart(4, "0")}`,
    productId: `gid://shopify/Product/${n}`,
    imageUrl: `https://cdn.shopify.com/s/files/1/shoe-${n}.jpg`,
    productTitle: `Shoe ${n}`,
    locale: "en",
    draft: text,
    needsReview: false,
    confidence: "high",
    decorative: text === "",
    reason: "",
    customId: `m_${n}`,
    model: "claude-haiku-5-5",
  };
}

const DRAFTS = Array.from({ length: 200 }, (_, i) => draft(i + 1));

/** Splits our CSV back into rows. Enough for these tests: quoted cells with commas, quotes and newlines. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  return rows;
}

describe("seeded sample", () => {
  it("is the same for the same seed and different for another", () => {
    const a = seededSample(DRAFTS, 50, SHEET_SEED).map((d) => d.mediaId);
    const b = seededSample(DRAFTS, 50, SHEET_SEED).map((d) => d.mediaId);
    const c = seededSample(DRAFTS, 50, SHEET_SEED + 1).map((d) => d.mediaId);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a).size).toBe(50);
  });

  it("returns every row when there are fewer than asked for", () => {
    expect(seededSample([1, 2, 3], 50, 1).sort()).toEqual([1, 2, 3]);
  });

  it("produces numbers in [0, 1)", () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("rating sheet", () => {
  it("samples 50 drafts with the rubric columns, the same whatever order results arrived in", () => {
    const sheet = ratingSheet(DRAFTS);
    const shuffled = ratingSheet(DRAFTS.slice().reverse());
    expect(sheet.csv).toBe(shuffled.csv);
    expect(sheet.poolSize).toBe(200);
    const rows = parseCsv(sheet.csv);
    expect(rows[0]).toEqual([...SHEET_COLUMNS]);
    expect(rows[0]).toEqual([
      "sample",
      "media ID",
      "image URL",
      "product title",
      "draft",
      "rating 1 to 5",
      "accurate yes/no",
      "would publish yes/no",
      "notes",
    ]);
    expect(rows).toHaveLength(51);
    expect(rows[1].slice(0, 1)).toEqual(["1"]);
    expect(rows[1].slice(5)).toEqual(["", "", "", ""]);
    const byId = new Map(DRAFTS.map((d) => [d.mediaId, d]));
    for (const r of rows.slice(1)) {
      const d = byId.get(r[1])!;
      expect(r.slice(2, 5)).toEqual([d.imageUrl, d.productTitle, d.draft]);
    }
  });

  it("leaves out decorative images with empty alt", () => {
    const sheet = ratingSheet([draft(1), draft(2, ""), draft(3)], 50);
    expect(sheet.poolSize).toBe(2);
    expect(sheet.sampled.map((d) => d.customId).sort()).toEqual(["m_1", "m_3"]);
  });
});

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("Red mug, 12 oz")).toBe('"Red mug, 12 oz"');
    expect(csvCell('The "Classic" tee')).toBe('"The ""Classic"" tee"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("stops store text from running as a spreadsheet formula", () => {
    expect(csvCell('=HYPERLINK("https://evil.example","x")')).toBe(`"'=HYPERLINK(""https://evil.example"",""x"")"`);
    expect(csvCell("+1 shoe")).toBe("'+1 shoe");
    expect(csvCell("-shoe")).toBe("'-shoe");
    expect(csvCell("@shoe")).toBe("'@shoe");
  });

  it("starts with a byte order mark and uses CRLF line ends", () => {
    const csv = toCsv([["a", "b"], ["c", "é"]]);
    expect(csv).toBe("\uFEFFa,b\r\nc,é\r\n");
  });
});

describe("sheet CLI", () => {
  it("writes the CSV next to the results file", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const dir = tempDir();
    try {
      const results = path.join(dir, "results.jsonl");
      fs.writeFileSync(results, DRAFTS.slice(0, 60).map((d) => JSON.stringify(d)).join("\n") + "\nnot json\n");
      const r = spawnSync(path.join(root, "node_modules", ".bin", "tsx"), [path.join(root, "scripts", "alt-text", "sheet.ts"), "--results", results], {
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("Wrote 50 rows");
      expect(r.stderr).toContain("line 61: not valid JSON; skipped");
      const csv = fs.readFileSync(path.join(dir, "rating-sheet.csv"), "utf8");
      expect(csv).toBe(ratingSheet(DRAFTS.slice(0, 60)).csv);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
