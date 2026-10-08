import { describe, expect, it } from "vitest";
import { InvalidPatchError } from "../../../app/lib/delivery/errors";
import { backoffMs, DEFAULT_RETRY, retryAfterMs } from "../../../app/lib/delivery/http";
import { countedBytes, fileSizeLimit, fileSizeProblem } from "../../../app/lib/delivery/limits";
import { fileConflict, patchFromFileChanges, splitPatch, themePathProblem, utf8, validatePatch } from "../../../app/lib/delivery/patch";
import { HEADER_AFTER, HEADER_BEFORE, samplePatch } from "./helpers";

describe("validatePatch", () => {
  it("accepts the sample patch", () => {
    expect(() => validatePatch(samplePatch())).not.toThrow();
  });

  it("lists every problem at once", () => {
    const err = (() => {
      try {
        validatePatch({
          id: "Bad Id",
          title: " ",
          files: [
            { file: "sections/a.liquid", before: "x", after: "x" },
            { file: "sections/a.liquid", before: "x", after: "y" },
            { file: "/etc/passwd", before: null, after: "x" },
            { file: "templates/*.json", before: null, after: "{}" },
          ],
          altText: [{ productId: "p", mediaId: "m", before: "", after: "x".repeat(513) }],
        });
      } catch (e) {
        return e as InvalidPatchError;
      }
    })();
    expect(err).toBeInstanceOf(InvalidPatchError);
    expect(err?.problems.join("\n")).toMatch(/id "Bad Id"/);
    expect(err?.problems.join("\n")).toMatch(/title is empty/);
    expect(err?.problems.join("\n")).toMatch(/does not change/);
    expect(err?.problems.join("\n")).toMatch(/appears twice/);
    expect(err?.problems.join("\n")).toMatch(/not under a theme folder/);
    expect(err?.problems.join("\n")).toMatch(/character theme paths do not use/);
    expect(err?.problems.join("\n")).toMatch(/longer than 512/);
  });

  it("refuses files over Shopify's size limit, ignoring the schema block", () => {
    const big = "a".repeat(256_001);
    expect(fileSizeProblem("sections/x.liquid", big)).toMatch(/limit/);
    const withSchema = `x{% schema %}${big}{% endschema %}`;
    expect(countedBytes("sections/x.liquid", withSchema)).toBeLessThan(100);
    expect(fileSizeProblem("sections/x.liquid", withSchema)).toBeNull();
    expect(fileSizeLimit("config/settings_data.json")).toBe(1_500_000);
    expect(fileSizeLimit("templates/product.json")).toBe(512_000);
    expect(fileSizeLimit("assets/base.css")).toBeNull();
    expect(() => validatePatch(samplePatch({ files: [{ file: "snippets/x.liquid", before: null, after: big }] }))).toThrow(/limit/);
  });

  it("checks theme paths", () => {
    expect(themePathProblem("sections/header.liquid")).toBeNull();
    expect(themePathProblem("templates/customers/account.json")).toBeNull();
    expect(themePathProblem("sections/../config/settings_data.json")).toMatch(/plain relative/);
    expect(themePathProblem("node_modules/x.js")).toMatch(/theme folder/);
    expect(themePathProblem("sections")).toMatch(/plain relative/);
  });
});

describe("patchFromFileChanges", () => {
  it("merges chained fixer patches on one file", () => {
    const mid = HEADER_BEFORE.replace("header__icon", "header__icon link");
    const fixerPatches = [
      { file: "sections/header.liquid", before: HEADER_BEFORE, after: mid, type: "empty-link", fixer: "a", notes: [] },
      { file: "sections/header.liquid", before: mid, after: HEADER_AFTER, type: "empty-link", fixer: "b", notes: [] },
    ];
    const patch = patchFromFileChanges("p-002", "Fix header", fixerPatches);
    expect(patch.files).toEqual([{ file: "sections/header.liquid", before: HEADER_BEFORE, after: HEADER_AFTER }]);
  });

  it("refuses patches that do not chain", () => {
    expect(() =>
      patchFromFileChanges("p-003", "x", [
        { file: "sections/header.liquid", before: "a", after: "b" },
        { file: "sections/header.liquid", before: "c", after: "d" },
      ]),
    ).toThrow(/do not chain/);
  });

  it("splits theme files from alt text", () => {
    const patch = samplePatch({ altText: [{ productId: "p", mediaId: "m", before: "", after: "x" }] });
    const { theme, altText } = splitPatch(patch);
    expect(theme?.files).toHaveLength(3);
    expect(theme?.altText).toHaveLength(0);
    expect(altText?.files).toHaveLength(0);
    expect(altText?.altText).toHaveLength(1);
  });
});

describe("fileConflict", () => {
  it("compares bytes, not just text", () => {
    expect(fileConflict("a", utf8("x\r\n"), "x\n")).toEqual({ file: "a", reason: "changed" });
    expect(fileConflict("a", utf8("x\n"), "x\n")).toBeNull();
    expect(fileConflict("a", null, "x")).toEqual({ file: "a", reason: "missing" });
    expect(fileConflict("a", utf8("x"), null)).toEqual({ file: "a", reason: "exists" });
    expect(fileConflict("a", null, null)).toBeNull();
  });
});

describe("retry helpers", () => {
  it("backs off exponentially within bounds", () => {
    expect(backoffMs(0, DEFAULT_RETRY, () => 1)).toBe(1000);
    expect(backoffMs(3, DEFAULT_RETRY, () => 1)).toBe(8000);
    expect(backoffMs(10, DEFAULT_RETRY, () => 1)).toBe(30_000);
    expect(backoffMs(3, DEFAULT_RETRY, () => 0)).toBe(4000);
  });

  it("reads Retry-After as seconds or a date", () => {
    const h = (v: string | null) => ({ get: () => v });
    expect(retryAfterMs(h("2"))).toBe(2000);
    expect(retryAfterMs(h(null))).toBeNull();
    expect(retryAfterMs(h("Thu, 08 Oct 2026 12:00:05 GMT"), () => Date.parse("2026-10-08T12:00:00Z"))).toBe(5000);
  });
});
