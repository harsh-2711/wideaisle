import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { check } from "@shopify/theme-check-node";
import { beforeAll, describe, expect, it } from "vitest";
import { applyFixes, fixTheme } from "../../app/lib/fixers/engine";
import type { ThemeFiles } from "../../app/lib/fixers/types";
import { loadTheme } from "../a11y/render";
import { dawnDir, requireDawn } from "./dawn-source";

let dir: string | null = null;
beforeAll(() => {
  // Skips offline on a laptop; throws under CI so the job cannot pass empty.
  dir = requireDawn(dawnDir());
}, 180000);

describe("fixers on stock Dawn 16", () => {
  it("leave Dawn's own markup alone and are idempotent", (ctx) => {
    if (!dir) return ctx.skip();
    const theme = loadTheme(dir);
    const report = fixTheme(theme);
    const changes = report.files.flatMap((f) => f.patches.flatMap((p) => p.notes.map((n) => `${f.file}: ${n}`)));
    // Dawn names its icons, labels its fields, sets lang, and its default
    // colour schemes pass. Two real gaps remain in Dawn 16, and nothing else
    // may change: anything more is a false positive.
    expect(changes).toEqual([
      // An icon-only info button, shown when quantity rules apply.
      "sections/main-cart-items.liquid: Named the info button on line 240 (English default (no translation key in theme)).",
      // The label's for= holds translated text, not the input's id "Password".
      "sections/main-password-header.liquid: Labelled the <input> on line 64 from its placeholder text.",
    ]);
    expect(fixTheme(applyFixes(theme, report)).files).toEqual([]);
  });

  it("only flag for review what a person should look at", (ctx) => {
    if (!dir) return ctx.skip();
    const report = fixTheme(loadTheme(dir));
    expect(report.review).toEqual([]);
  });

  it("pass Theme Check with no new offenses", async (ctx) => {
    if (!dir) return ctx.skip();
    const theme = loadTheme(dir);
    const patched = applyFixes(theme, fixTheme(theme));
    const write = (files: ThemeFiles) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-tc-"));
      for (const [f, text] of files) {
        fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
        fs.writeFileSync(path.join(root, f), text);
      }
      return root;
    };
    const summary = (offenses: Awaited<ReturnType<typeof check>>) => {
      const counts: Record<string, number> = {};
      for (const o of offenses) counts[o.check] = (counts[o.check] ?? 0) + 1;
      return counts;
    };
    const [beforeRoot, afterRoot] = [write(theme), write(patched)];
    try {
      const before = summary(await check(beforeRoot));
      const after = summary(await check(afterRoot));
      for (const [name, n] of Object.entries(after)) expect(n, name).toBeLessThanOrEqual(before[name] ?? 0);
    } finally {
      fs.rmSync(beforeRoot, { recursive: true, force: true });
      fs.rmSync(afterRoot, { recursive: true, force: true });
    }
  }, 180000);
});
