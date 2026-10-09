// Regression tests from the review of PR #41: failure paths of the Admin API
// route, run against a stateful fake store.
import { describe, expect, it } from "vitest";
import { AdminApiAdapter, type AdminApiAdapterOptions } from "../../../app/lib/delivery/admin-api";
import { PartialApplyError } from "../../../app/lib/delivery/errors";
import { md5Hex, utf8 } from "../../../app/lib/delivery/patch";
import type { DeliveryPatch } from "../../../app/lib/delivery/types";
import { FakeShopify, LIVE_ID, type FakeHooks } from "./fake-shopify";
import { ALT_AFTER, FIXED_NOW, MEDIA_ID, PRODUCT_ID } from "./helpers";

const SHOP = "wideaisle-dev.myshopify.com";

function setup(files: Record<string, string | Buffer>, hooks: FakeHooks = {}, opts: Partial<AdminApiAdapterOptions> = {}) {
  const shop = new FakeShopify(files, hooks);
  const adapter = new AdminApiAdapter({ client: shop, shop: SHOP, sleep: async () => {}, maxPolls: 3, now: FIXED_NOW, random: () => 1, ...opts });
  return { shop, adapter };
}

const patch = (files: DeliveryPatch["files"], altText: DeliveryPatch["altText"] = []): DeliveryPatch => ({ id: "p-001", title: "Fix", files, altText });
const writes = (ops: string[]) => ops.filter((op) => /Upsert|FilesDelete|FileUpdate|Duplicate/.test(op));

describe("AdminApiAdapter failure paths", () => {
  it("does not report a revert as done while an apply job is still running (item 1)", async () => {
    const { shop, adapter } = setup({ "snippets/a.liquid": "a\n", "snippets/b.liquid": "b\n" }, { slowJobs: true });
    const p = patch([
      { file: "snippets/a.liquid", before: "a\n", after: "A\n" },
      { file: "snippets/b.liquid", before: "b\n", after: "B\n" },
    ]);
    const err = await adapter.apply(p).catch((e) => e);
    expect(err).toBeInstanceOf(PartialApplyError);
    expect(err.cause).toMatchObject({ code: "JOB_TIMEOUT" });
    expect(err.receipt.pendingJobs).toEqual(["gid://shopify/Job/1"]);

    // The job is still running: revert must refuse and write nothing.
    shop.ops.length = 0;
    await expect(adapter.revert(err.receipt)).rejects.toMatchObject({ code: "JOB_PENDING" });
    expect(writes(shop.ops)).toEqual([]);

    // The job lands with the patch; a revert now restores both files.
    shop.finishJobs();
    expect(shop.live("snippets/a.liquid")).toBe("A\n");
    // The revert's own job also runs slowly; Shopify finishes it while we wait.
    const patient = new AdminApiAdapter({ client: shop, shop: SHOP, sleep: async () => shop.finishJobs(), now: FIXED_NOW });
    const r = await patient.revert(err.receipt);
    expect(r.files).toEqual(["snippets/a.liquid", "snippets/b.liquid"]);
    expect(shop.live("snippets/a.liquid")).toBe("a\n");
    expect(shop.live("snippets/b.liquid")).toBe("b\n");
  });

  it("reverts a file Shopify changed on write, using the checksum it reported (item 2)", async () => {
    const trim = (file: string, b: Buffer) => (file.endsWith(".json") ? Buffer.from(b.toString("utf8").trimEnd()) : b);
    const { shop, adapter } = setup({ "templates/index.json": '{"sections":{}}\n', "snippets/a.liquid": "a\n" }, { normalize: trim });
    const p = patch([
      { file: "snippets/a.liquid", before: "a\n", after: "A\n" },
      { file: "templates/index.json", before: '{"sections":{}}\n', after: '{"sections":{"x":{}}}\n' },
    ]);
    const err = await adapter.apply(p).catch((e) => e);
    expect(err).toBeInstanceOf(PartialApplyError);
    expect(err.cause).toMatchObject({ code: "VERIFY_FAILED" });
    const json = err.receipt.files.find((f: { file: string }) => f.file === "templates/index.json");
    expect(json.storedMd5).toBe(md5Hex(utf8('{"sections":{"x":{}}}')));

    const r = await adapter.revert(err.receipt).catch((e) => e);
    // Shopify trims the restored JSON too, so its read-back differs; the
    // Liquid file is back exactly and the JSON holds its trimmed before.
    expect(shop.live("snippets/a.liquid")).toBe("a\n");
    expect(shop.live("templates/index.json")).toBe('{"sections":{}}');
    expect(r).toMatchObject({ code: "VERIFY_FAILED" });
  });

  it("refuses to write when the bytes it read do not match Shopify's checksum (item 5)", async () => {
    // <p>é</p> in Latin-1: not valid UTF-8, so a Text body loses bytes.
    const latin1 = Buffer.from([0x3c, 0x70, 0x3e, 0xe9, 0x3c, 0x2f, 0x70, 0x3e, 0x0a]);
    const { shop, adapter } = setup({ "snippets/l.liquid": latin1 }, { textBodies: true });
    const lossy = latin1.toString("utf8");
    await expect(adapter.apply(patch([{ file: "snippets/l.liquid", before: lossy, after: `${lossy}<!-- fixed -->\n` }]))).rejects.toMatchObject({
      code: "CHECKSUM_MISMATCH",
    });
    expect(writes(shop.ops)).toEqual([]);
    expect(Buffer.from(shop.themes.get(LIVE_ID)?.files.get("snippets/l.liquid") as Buffer).equals(latin1)).toBe(true);
  });

  it("reverts theme files when a product image was deleted after apply (item 6)", async () => {
    const { shop, adapter } = setup({ "snippets/a.liquid": "a\n" });
    shop.alt.set(MEDIA_ID, "");
    const receipt = await adapter.apply(
      patch([{ file: "snippets/a.liquid", before: "a\n", after: "A\n" }], [{ productId: PRODUCT_ID, mediaId: MEDIA_ID, before: "", after: ALT_AFTER }]),
    );
    shop.alt.delete(MEDIA_ID);
    const r = await adapter.revert(receipt);
    expect(shop.live("snippets/a.liquid")).toBe("a\n");
    expect(r.altText).toEqual([]);
    expect(r.skippedMedia).toEqual([MEDIA_ID]);
  });

  it("does not retry MEDIA_CANNOT_BE_MODIFIED (item 13)", async () => {
    const { shop, adapter } = setup({}, { mediaBusy: 1 });
    shop.alt.set(MEDIA_ID, "");
    const err = await adapter.apply(patch([], [{ productId: PRODUCT_ID, mediaId: MEDIA_ID, before: "", after: ALT_AFTER }])).catch((e) => e);
    expect(err).toBeInstanceOf(PartialApplyError);
    expect(err.cause).toMatchObject({ code: "MEDIA_CANNOT_BE_MODIFIED" });
    expect(shop.ops.filter((op) => op === "WaFileUpdate")).toHaveLength(1);
  });

  it("previews from the theme passed as themeId, not the live theme (item 17)", async () => {
    const { shop, adapter } = setup({ "snippets/a.liquid": "live\n" }, {}, { themeId: "gid://shopify/OnlineStoreTheme/9" });
    shop.themes.set("gid://shopify/OnlineStoreTheme/9", { name: "Staging", role: "UNPUBLISHED", files: new Map([["snippets/a.liquid", Buffer.from("a\n")]]) });
    const p = await adapter.preview(patch([{ file: "snippets/a.liquid", before: "a\n", after: "A\n" }]));
    expect(p.sourceThemeId).toBe("gid://shopify/OnlineStoreTheme/9");
    expect(shop.ops).not.toContain("WaMainTheme");
    expect(shop.themes.get(p.themeId as string)?.files.get("snippets/a.liquid")?.toString()).toBe("A\n");
    expect(shop.live("snippets/a.liquid")).toBe("live\n");
  });

  it("refuses a preview when a preview theme with that name already exists (item 7)", async () => {
    const { shop, adapter } = setup({ "snippets/a.liquid": "a\n" });
    shop.themes.set("gid://shopify/OnlineStoreTheme/5", { name: "Wide Aisle preview p-001", role: "UNPUBLISHED", files: new Map() });
    await expect(adapter.preview(patch([{ file: "snippets/a.liquid", before: "a\n", after: "A\n" }]))).rejects.toMatchObject({ code: "PREVIEW_EXISTS" });
    expect(writes(shop.ops)).toEqual([]);
  });
});
