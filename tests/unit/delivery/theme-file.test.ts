import { unzipSync, zipSync, type Zippable } from "fflate";
import { describe, expect, it } from "vitest";
import { DeliveryApiError, InvalidPatchError, PatchConflictError } from "../../../app/lib/delivery/errors";
import { sha256Hex, utf8 } from "../../../app/lib/delivery/patch";
import { ThemeFileAdapter, findThemeRoot } from "../../../app/lib/delivery/theme-file";
import { CSS_AFTER, FIXED_NOW, HEADER_AFTER, HEADER_BEFORE, LOGO_BYTES, NEW_SNIPPET, THEME_TEXT, samplePatch } from "./helpers";

function buildZip(root = ""): Uint8Array {
  const files: Zippable = {};
  if (root) files[root] = new Uint8Array(0);
  for (const [name, text] of Object.entries(THEME_TEXT)) files[root + name] = utf8(text);
  files[`${root}assets/logo.png`] = LOGO_BYTES;
  return zipSync(files, { level: 9, mtime: new Date("2026-01-02T03:04:05Z") });
}

const bytes = (u: Uint8Array) => Buffer.from(u);

describe("ThemeFileAdapter (patched theme zip, offline)", () => {
  it("applies a patch end to end and reverts to the exact original bytes", async () => {
    const original = buildZip();
    const adapter = new ThemeFileAdapter(original, { now: FIXED_NOW });
    const patch = samplePatch();

    const preview = await adapter.preview(patch);
    expect(preview.files.map((f) => [f.file, f.action])).toEqual([
      ["sections/header.liquid", "update"],
      ["assets/base.css", "update"],
      ["snippets/wa-visually-hidden.liquid", "create"],
    ]);

    const receipt = await adapter.apply(patch);
    const patched = unzipSync(receipt.zip);
    expect(Buffer.from(patched["sections/header.liquid"]).toString("utf8")).toBe(HEADER_AFTER);
    // CRLF line endings survive.
    expect(bytes(patched["assets/base.css"]).equals(utf8(CSS_AFTER))).toBe(true);
    expect(Buffer.from(patched["snippets/wa-visually-hidden.liquid"]).toString("utf8")).toBe(NEW_SNIPPET);
    // Untouched files, binary included, keep their bytes.
    expect(bytes(patched["assets/logo.png"]).equals(Buffer.from(LOGO_BYTES))).toBe(true);
    for (const name of ["layout/theme.liquid", "config/settings_data.json", "locales/en.default.json"]) {
      expect(bytes(patched[name]).equals(utf8(THEME_TEXT[name]))).toBe(true);
    }
    expect(Object.keys(patched).sort()).toEqual([...Object.keys(THEME_TEXT), "assets/logo.png", "snippets/wa-visually-hidden.liquid"].sort());
    expect(receipt.zipSha256).toBe(sha256Hex(receipt.zip));

    const reverted = await adapter.revert(receipt);
    expect(bytes(reverted.zip).equals(bytes(original))).toBe(true);
    expect(reverted.sha256).toBe(sha256Hex(original));
    expect(reverted.files).toEqual(patch.files.map((f) => f.file));
  });

  it("keeps the theme's top folder when the zip has one", async () => {
    const adapter = new ThemeFileAdapter(buildZip("dawn/"), { now: FIXED_NOW });
    const receipt = await adapter.apply(samplePatch());
    expect(receipt.root).toBe("dawn/");
    const patched = unzipSync(receipt.zip);
    expect(Buffer.from(patched["dawn/sections/header.liquid"]).toString("utf8")).toBe(HEADER_AFTER);
    expect(patched["dawn/snippets/wa-visually-hidden.liquid"]).toBeDefined();
    expect(patched["sections/header.liquid"]).toBeUndefined();
  });

  it("does not see changes the caller makes to its buffer after construction", async () => {
    const original = buildZip();
    const keep = Buffer.from(original);
    const adapter = new ThemeFileAdapter(original, { now: FIXED_NOW });
    original.fill(0);
    const receipt = await adapter.apply(samplePatch());
    expect(Buffer.from((await adapter.revert(receipt)).zip).equals(keep)).toBe(true);
  });

  it("refuses to apply when a before does not match the zip", async () => {
    const adapter = new ThemeFileAdapter(buildZip(), { now: FIXED_NOW });
    const patch = samplePatch({
      files: [
        { file: "sections/header.liquid", before: HEADER_BEFORE.replace("cart", "basket"), after: HEADER_AFTER },
        { file: "sections/missing.liquid", before: "x", after: "y" },
        { file: "assets/base.css", before: null, after: CSS_AFTER },
      ],
    });
    const err = await adapter.apply(patch).catch((e) => e);
    expect(err).toBeInstanceOf(PatchConflictError);
    expect((err as PatchConflictError).conflicts).toEqual([
      { file: "sections/header.liquid", reason: "changed" },
      { file: "sections/missing.liquid", reason: "missing" },
      { file: "assets/base.css", reason: "exists" },
    ]);
    await expect(adapter.preview(patch)).rejects.toBeInstanceOf(PatchConflictError);
  });

  it("refuses a revert whose stored original was altered", async () => {
    const adapter = new ThemeFileAdapter(buildZip(), { now: FIXED_NOW });
    const receipt = await adapter.apply(samplePatch());
    receipt.originalZip[0] ^= 0xff;
    await expect(adapter.revert(receipt)).rejects.toMatchObject({ code: "VERIFY_FAILED" });
  });

  it("refuses alt text, bad paths and input that is not a theme zip", async () => {
    const adapter = new ThemeFileAdapter(buildZip());
    await expect(
      adapter.apply(samplePatch({ altText: [{ productId: "gid://shopify/Product/1", mediaId: "gid://shopify/MediaImage/1", before: "", after: "Red shoe" }] })),
    ).rejects.toBeInstanceOf(InvalidPatchError);
    await expect(adapter.apply(samplePatch({ files: [{ file: "../layout/theme.liquid", before: "a", after: "b" }] }))).rejects.toBeInstanceOf(
      InvalidPatchError,
    );
    await expect(new ThemeFileAdapter(utf8("not a zip")).apply(samplePatch())).rejects.toMatchObject({ code: "INVALID_ZIP" });
    const notTheme = zipSync({ "readme.txt": utf8("hi") });
    await expect(new ThemeFileAdapter(notTheme).apply(samplePatch())).rejects.toMatchObject({ code: "INVALID_ZIP" });
  });

  it("refuses zips over the size limits", async () => {
    const zip = buildZip();
    await expect(new ThemeFileAdapter(zip, { maxZipBytes: 10 }).preview(samplePatch())).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(new ThemeFileAdapter(zip, { maxUnzippedBytes: 100 }).preview(samplePatch())).rejects.toBeInstanceOf(DeliveryApiError);
  });

  it("finds the theme root or explains why not", () => {
    expect(findThemeRoot(["layout/theme.liquid"])).toBe("");
    expect(findThemeRoot(["x/", "x/layout/theme.liquid"])).toBe("x/");
    expect(() => findThemeRoot(["a/layout/theme.liquid", "b/layout/theme.liquid"])).toThrow(/more than one theme/);
  });
});
