import { describe, expect, it } from "vitest";
import { ADMIN_QUERIES, AdminApiAdapter, type AdminApiAdapterOptions, type AdminApiReceipt } from "../../../app/lib/delivery/admin-api";
import { DeliveryApiError, PartialApplyError, PatchConflictError } from "../../../app/lib/delivery/errors";
import { md5Hex, utf8 } from "../../../app/lib/delivery/patch";
import { AdminGraphqlClient } from "../../../app/lib/delivery/shopify-admin";
import {
  ALT_AFTER,
  CSS_BEFORE,
  FIXED_NOW,
  HEADER_AFTER,
  HEADER_BEFORE,
  MEDIA_ID,
  PRODUCT_ID,
  fixture,
  replay,
  samplePatch,
  type Exchange,
} from "./helpers";

const SHOP = "wideaisle-dev.myshopify.com";
const LIVE = "gid://shopify/OnlineStoreTheme/111111111";
const COPY = "gid://shopify/OnlineStoreTheme/222222222";
const SNIPPET = "snippets/wa-visually-hidden.liquid";
const f = (name: string) => fixture(`shopify/${name}.json`);

type Vars = { variables: Record<string, unknown> };
const vars = (body: unknown) => (body as Vars).variables;

function setup(exchanges: Exchange[], opts: Partial<AdminApiAdapterOptions> = {}, maxAttempts = 6) {
  const r = replay(exchanges);
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  const client = new AdminGraphqlClient({ shop: SHOP, accessToken: "shpat_test", fetch: r.fetch, sleep, random: () => 1, retry: { maxAttempts } });
  const adapter = new AdminApiAdapter({ client, shop: SHOP, sleep, random: () => 1, now: FIXED_NOW, ...opts });
  return { ...r, sleeps, adapter };
}

function receipt(overrides: Partial<AdminApiReceipt> = {}): AdminApiReceipt {
  return {
    route: "admin-api",
    patchId: "p-001",
    appliedAt: FIXED_NOW().toISOString(),
    shop: SHOP,
    themeId: LIVE,
    // The checksums in theme-files-applied.json, read back after the write.
    files: samplePatch().files.map((c) => ({ ...c, storedMd5: md5Hex(utf8(c.after)) })),
    altText: [],
    pendingJobs: [],
    ...overrides,
  };
}

const NO_PREVIEW_YET: Exchange = { op: "WaThemesByName", body: f("themes-by-name-none"), check: (b) => expect(vars(b)).toEqual({ names: ["Wide Aisle preview p-001"] }) };

const mutations = (calls: { op: string }[]) =>
  calls.map((c) => c.op).filter((op) => /Upsert|Delete|Duplicate|FileUpdate/.test(op));

const altPatch = () => samplePatch({ files: [], altText: [{ productId: PRODUCT_ID, mediaId: MEDIA_ID, before: "", after: ALT_AFTER }] });

describe("AdminApiAdapter preview", () => {
  it("writes the patch to an unpublished copy of the live theme", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live"), check: (b) => expect(vars(b)).toMatchObject({ id: LIVE }) },
      NO_PREVIEW_YET,
      {
        op: "WaThemeDuplicate",
        body: f("theme-duplicate"),
        check: (b) => expect(vars(b)).toEqual({ id: LIVE, name: "Wide Aisle preview p-001" }),
      },
      { op: "WaThemeInfo", body: f("theme-info-processing") },
      { op: "WaThemeInfo", body: f("theme-info-ready") },
      { op: "WaThemeFiles", body: f("theme-files-live"), check: (b) => expect(vars(b)).toMatchObject({ id: COPY }) },
      { op: "WaThemeFilesUpsert", body: f("files-upsert-job"), check: (b) => expect(vars(b)).toMatchObject({ themeId: COPY }) },
      { op: "WaJob", body: f("job-running") },
      { op: "WaJob", body: f("job-done") },
      { op: "WaThemeFiles", body: f("theme-files-applied"), check: (b) => expect(vars(b)).toMatchObject({ id: COPY }) },
    ]);
    const preview = await t.adapter.preview(samplePatch());
    expect(preview).toMatchObject({
      route: "admin-api",
      themeId: COPY,
      sourceThemeId: LIVE,
      themeName: "Wide Aisle preview p-001",
      previewUrl: "https://wideaisle-dev.myshopify.com/?preview_theme_id=222222222",
    });
    expect(t.left()).toEqual([]);
    // Nothing was written to the live theme.
    expect(t.calls.filter((c) => c.op === "WaThemeFilesUpsert").every((c) => vars(c.body).themeId === COPY)).toBe(true);
    expect(t.sleeps).toEqual([1000, 1000]);
    expect(t.calls[0].url).toBe("https://wideaisle-dev.myshopify.com/admin/api/2026-10/graphql.json");
    expect(t.calls[0].init.headers["X-Shopify-Access-Token"]).toBe("shpat_test");
  });

  it("refuses before duplicating when a before does not match", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-merchant-edited") },
    ]);
    await expect(t.adapter.preview(samplePatch())).rejects.toBeInstanceOf(PatchConflictError);
    expect(mutations(t.calls)).toEqual([]);
  });

  it("deletes a half-made preview theme when a write fails", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      NO_PREVIEW_YET,
      { op: "WaThemeDuplicate", body: f("theme-duplicate") },
      { op: "WaThemeInfo", body: f("theme-info-ready") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      { op: "WaThemeFilesUpsert", body: f("files-upsert-invalid") },
      { op: "WaThemeDelete", body: f("theme-delete"), check: (b) => expect(vars(b)).toEqual({ id: COPY }) },
    ]);
    await expect(t.adapter.preview(samplePatch())).rejects.toMatchObject({ code: "FILE_VALIDATION_ERROR" });
    expect(t.left()).toEqual([]);
  });

  it("explains a themeDuplicate userError", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      NO_PREVIEW_YET,
      { op: "WaThemeDuplicate", body: f("theme-duplicate-not-found") },
    ]);
    await expect(t.adapter.preview(samplePatch())).rejects.toMatchObject({ code: "NOT_FOUND", message: /Theme does not exist/ });
  });

  it("does not resend themeDuplicate after a 5xx; it finds the copy by name (item 7)", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      NO_PREVIEW_YET,
      { op: "WaThemeDuplicate", status: 502, body: "" },
      { op: "WaThemesByName", body: f("themes-by-name-found") },
      { op: "WaThemeInfo", body: f("theme-info-ready") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      { op: "WaThemeFilesUpsert", body: f("files-upsert-done") },
      { op: "WaThemeFiles", body: f("theme-files-applied") },
    ]);
    const p = await t.adapter.preview(samplePatch());
    expect(p.themeId).toBe(COPY);
    expect(t.calls.filter((c) => c.op === "WaThemeDuplicate")).toHaveLength(1);
    expect(t.left()).toEqual([]);
  });

  it("passes the 5xx on when no copy was made", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      NO_PREVIEW_YET,
      { op: "WaThemeDuplicate", status: 502, body: "" },
      { op: "WaThemesByName", body: f("themes-by-name-none") },
    ]);
    await expect(t.adapter.preview(samplePatch())).rejects.toMatchObject({ code: "HTTP_502" });
  });
});

describe("AdminApiAdapter apply and revert", () => {
  it("applies to the live theme, waits for the job and checks the bytes", async () => {
    const patch = samplePatch();
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      {
        op: "WaThemeFilesUpsert",
        body: f("files-upsert-job"),
        check: (b) =>
          expect(vars(b)).toEqual({
            themeId: LIVE,
            files: patch.files.map((c) => ({ filename: c.file, body: { type: "TEXT", value: c.after } })),
          }),
      },
      { op: "WaJob", body: f("job-done") },
      { op: "WaThemeFiles", body: f("theme-files-applied") },
    ]);
    const r = await t.adapter.apply(patch);
    expect(r).toEqual(receipt());
    expect(t.left()).toEqual([]);
  });

  it("refuses to apply when the merchant changed a file since the scan", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-merchant-edited") },
    ]);
    const err = await t.adapter.apply(samplePatch()).catch((e) => e);
    expect(err).toBeInstanceOf(PatchConflictError);
    expect(err.conflicts).toEqual([{ file: "sections/header.liquid", reason: "changed" }]);
    expect(mutations(t.calls)).toEqual([]);
  });

  it("reverts byte for byte and deletes the file the patch created", async () => {
    const t = setup([
      { op: "WaThemeFiles", body: f("theme-files-applied") },
      {
        op: "WaThemeFilesUpsert",
        body: f("files-upsert-done"),
        check: (b) =>
          expect(vars(b)).toEqual({
            themeId: LIVE,
            files: [
              { filename: "sections/header.liquid", body: { type: "TEXT", value: HEADER_BEFORE } },
              { filename: "assets/base.css", body: { type: "TEXT", value: CSS_BEFORE } },
            ],
          }),
      },
      { op: "WaThemeFilesDelete", body: f("files-delete"), check: (b) => expect(vars(b)).toEqual({ themeId: LIVE, files: [SNIPPET] }) },
      // Read back: header text, CSS as base64 with its CRLF, snippet gone.
      { op: "WaThemeFiles", body: f("theme-files-live") },
    ]);
    const result = await t.adapter.revert(receipt());
    expect(result).toMatchObject({ route: "admin-api", themeId: LIVE, files: ["sections/header.liquid", "assets/base.css", SNIPPET] });
    expect(t.left()).toEqual([]);
  });

  it("refuses to revert a file the merchant edited after apply", async () => {
    const t = setup([{ op: "WaThemeFiles", body: f("theme-files-merchant-edited") }]);
    const err = await t.adapter.revert(receipt()).catch((e) => e);
    expect(err).toBeInstanceOf(PatchConflictError);
    expect(err.stage).toBe("revert");
    expect(err.conflicts).toEqual([{ file: "sections/header.liquid", reason: "changed" }]);
    expect(mutations(t.calls)).toEqual([]);
  });

  it("skips files that already hold their before", async () => {
    const t = setup([{ op: "WaThemeFiles", body: f("theme-files-live") }]);
    const result = await t.adapter.revert(receipt());
    expect(result.files).toEqual([]);
    expect(mutations(t.calls)).toEqual([]);
  });

  it("returns a partial receipt when a later batch fails", async () => {
    const t = setup(
      [
        { op: "WaMainTheme", body: f("themes-main") },
        { op: "WaThemeFiles", body: f("theme-files-live") },
        { op: "WaThemeFilesUpsert", body: f("files-upsert-done"), check: (b) => expect(vars(b).files).toHaveLength(1) },
        { op: "WaThemeFilesUpsert", body: f("files-upsert-invalid") },
      ],
      { filesPerCall: 1 },
    );
    const err = await t.adapter.apply(samplePatch()).catch((e) => e);
    expect(err).toBeInstanceOf(PartialApplyError);
    expect(err.receipt.files.map((c: { file: string }) => c.file)).toEqual(["sections/header.liquid", "assets/base.css"]);
    expect(err.cause).toMatchObject({ code: "FILE_VALIDATION_ERROR" });
  });

  it("times out a job that never finishes", async () => {
    const t = setup(
      [
        { op: "WaMainTheme", body: f("themes-main") },
        { op: "WaThemeFiles", body: f("theme-files-live") },
        { op: "WaThemeFilesUpsert", body: f("files-upsert-job") },
        { op: "WaJob", body: f("job-running") },
        { op: "WaJob", body: f("job-running") },
      ],
      { maxPolls: 2 },
    );
    const err = await t.adapter.apply(samplePatch()).catch((e) => e);
    expect(err).toBeInstanceOf(PartialApplyError);
    expect(err.cause).toMatchObject({ code: "JOB_TIMEOUT" });
  });

  it("reads bodies Shopify serves as a URL through the injected fetch", async () => {
    const patch = samplePatch({ files: [{ file: "sections/header.liquid", before: HEADER_BEFORE, after: HEADER_AFTER }] });
    const exchanges: Exchange[] = [
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-url-body") },
      { op: "GET /s/files/theme-file-download/header.liquid?sig=abc", body: HEADER_BEFORE },
      { op: "WaThemeFilesUpsert", body: f("files-upsert-done") },
      { op: "WaThemeFiles", body: f("theme-files-applied") },
    ];
    const t = setup(exchanges);
    const withFetch = new AdminApiAdapter({
      client: new AdminGraphqlClient({ shop: SHOP, accessToken: "x", fetch: t.fetch }),
      shop: SHOP,
      fetch: t.fetch,
      now: FIXED_NOW,
    });
    await expect(withFetch.apply(patch)).resolves.toMatchObject({ themeId: LIVE });

    const without = setup(exchanges.slice(0, 2));
    await expect(without.adapter.apply(patch)).rejects.toMatchObject({ code: "BODY_URL" });
  });
});

describe("AdminApiAdapter throttling and errors", () => {
  it("waits out THROTTLED using the cost block, and 429 using Retry-After", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("throttled") },
      { op: "WaMainTheme", status: 429, headers: { "Retry-After": "2" }, body: "" },
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      { op: "WaThemeFilesUpsert", body: f("files-upsert-throttled") },
      { op: "WaThemeFilesUpsert", body: f("files-upsert-job") },
      { op: "WaJob", body: f("job-done") },
      { op: "WaThemeFiles", body: f("theme-files-applied") },
    ]);
    await t.adapter.apply(samplePatch());
    // (652 requested - 152 available) / 100 per second = 5 s; then Retry-After 2 s;
    // then one backoff step for the THROTTLED userError.
    expect(t.sleeps).toEqual([5000, 2000, 1000]);
    expect(t.left()).toEqual([]);
  });

  it("gives up when still throttled after the retry budget", async () => {
    const t = setup(
      [
        { op: "WaMainTheme", body: f("throttled") },
        { op: "WaMainTheme", body: f("throttled") },
      ],
      {},
      2,
    );
    await expect(t.adapter.apply(samplePatch())).rejects.toMatchObject({ code: "THROTTLED" });
  });

  it("reports a missing write_themes exemption as ACCESS_DENIED", async () => {
    const t = setup([
      { op: "WaMainTheme", body: f("themes-main") },
      { op: "WaThemeFiles", body: f("theme-files-live") },
      { op: "WaThemeFilesUpsert", body: f("access-denied") },
    ]);
    const err = await t.adapter.apply(samplePatch()).catch((e) => e);
    // A write was attempted, so the caller gets a receipt it can revert with.
    expect(err).toBeInstanceOf(PartialApplyError);
    expect(err.cause).toBeInstanceOf(DeliveryApiError);
    expect(err.cause.code).toBe("ACCESS_DENIED");
    expect(err.cause.message).toMatch(/exemption/);
  });

  it("retries a query after a 5xx but never a mutation that may have run (item 7)", async () => {
    const q = setup([
      { op: "WaMainTheme", status: 503, body: "" },
      { op: "WaMainTheme", body: f("themes-main") },
    ]);
    const client = new AdminGraphqlClient({ shop: SHOP, accessToken: "x", fetch: q.fetch, sleep: async () => {}, random: () => 1 });
    await expect(client.request(ADMIN_QUERIES.mainTheme)).resolves.toMatchObject({ themes: { nodes: [{ id: LIVE }] } });

    const m = setup([{ op: "WaThemeDuplicate", status: 502, body: "" }]);
    const client2 = new AdminGraphqlClient({ shop: SHOP, accessToken: "x", fetch: m.fetch, sleep: async () => {} });
    await expect(client2.request(ADMIN_QUERIES.themeDuplicate, { id: LIVE, name: "n" })).rejects.toMatchObject({ code: "HTTP_502" });
    expect(m.calls).toHaveLength(1);
    // An idempotent write may be retried.
    const u = setup([
      { op: "WaThemeFilesUpsert", status: 502, body: "" },
      { op: "WaThemeFilesUpsert", body: f("files-upsert-done") },
    ]);
    const client3 = new AdminGraphqlClient({ shop: SHOP, accessToken: "x", fetch: u.fetch, sleep: async () => {} });
    await expect(client3.request(ADMIN_QUERIES.filesUpsert, { themeId: LIVE, files: [] }, { idempotent: true })).resolves.toBeDefined();
  });

  it("keeps the access token out of JSON and string output (item 12)", () => {
    const client = new AdminGraphqlClient({ shop: SHOP, accessToken: "shpat_SECRET", fetch: async () => Promise.reject(new Error("no")) });
    expect(JSON.stringify(client)).not.toContain("shpat_SECRET");
    expect(Object.values(client).join(" ")).not.toContain("shpat_SECRET");
  });

  it("refuses a bad shop domain and an unauthorized token", async () => {
    expect(() => new AdminGraphqlClient({ shop: "evil.example.com", accessToken: "x", fetch: async () => Promise.reject(new Error("no")) })).toThrow(
      /myshopify/,
    );
    const t = setup([{ op: "WaMainTheme", status: 401, body: { errors: "[API] Invalid API key or access token (unrecognized login or wrong password)" } }]);
    await expect(t.adapter.apply(samplePatch())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("AdminApiAdapter alt text", () => {
  it("applies and reverts alt text through fileUpdate without touching the theme", async () => {
    const patch = altPatch();
    const t = setup([
      { op: "WaMediaAlt", body: f("media-alt-before"), check: (b) => expect(vars(b)).toEqual({ ids: [MEDIA_ID] }) },
      { op: "WaFileUpdate", body: f("file-update"), check: (b) => expect(vars(b)).toEqual({ files: [{ id: MEDIA_ID, alt: ALT_AFTER }] }) },
      { op: "WaMediaAlt", body: f("media-alt-after") },
      { op: "WaFileUpdate", body: f("file-update-revert"), check: (b) => expect(vars(b)).toEqual({ files: [{ id: MEDIA_ID, alt: "" }] }) },
    ]);
    const r = await t.adapter.apply(patch);
    expect(r.themeId).toBeNull();
    expect(r.altText).toEqual(patch.altText);
    const back = await t.adapter.revert(r);
    expect(back.altText).toEqual([MEDIA_ID]);
    expect(t.calls.some((c) => c.op.startsWith("WaTheme"))).toBe(false);
    expect(t.left()).toEqual([]);
  });

  it("previews alt text without writing anything", async () => {
    const t = setup([{ op: "WaMediaAlt", body: f("media-alt-before") }]);
    const p = await t.adapter.preview(altPatch());
    expect(p).toMatchObject({ themeId: null, previewUrl: null, altText: altPatch().altText });
  });

  it("refuses alt text that changed since the scan", async () => {
    const t = setup([{ op: "WaMediaAlt", body: f("media-alt-after") }]);
    const err = await t.adapter.apply(altPatch()).catch((e) => e);
    expect(err).toBeInstanceOf(PatchConflictError);
    expect(err.conflicts).toEqual([{ mediaId: MEDIA_ID, reason: "changed" }]);
    expect(mutations(t.calls)).toEqual([]);
  });
});

describe("AdminApiAdapter discardPreview", () => {
  it("deletes a Wide Aisle preview and refuses the live theme", async () => {
    const t = setup([
      { op: "WaThemeInfo", body: f("theme-info-main") },
      { op: "WaThemeInfo", body: f("theme-info-ready") },
      { op: "WaThemeDelete", body: f("theme-delete") },
    ]);
    await expect(t.adapter.discardPreview(LIVE)).rejects.toMatchObject({ code: "NOT_A_PREVIEW" });
    await expect(t.adapter.discardPreview(COPY)).resolves.toBeUndefined();
    expect(t.left()).toEqual([]);
  });
});
