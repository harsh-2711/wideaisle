import { describe, expect, it } from "vitest";
import { AssetCache, freshForMs, parseCacheControl, replayHeaders, reusableForMs, type AssetRequest } from "../../../app/lib/scanner/asset-cache";

const NOW = Date.parse("2026-10-12T00:00:00Z");
const DATE = new Date(NOW).toUTCString();
const css = (over: Partial<AssetRequest> = {}): AssetRequest => ({
  method: "GET",
  url: "https://store.test/cdn/theme.css",
  resourceType: "stylesheet",
  headers: {},
  ...over,
});
const year = { "cache-control": "public, max-age=31536000", "content-type": "text/css" };
const body = Buffer.from("body{color:#111}");

describe("which responses are stored", () => {
  it("reads Cache-Control directives", () => {
    const cc = parseCacheControl('public, Max-Age=60, no-cache="set-cookie", max-age=5');
    expect(cc.get("max-age")).toBe("60");
    expect(cc.get("no-cache")).toBe("set-cookie");
    expect(cc.has("public")).toBe(true);
  });

  it("uses max-age before Expires, less the Age header", () => {
    expect(freshForMs(200, { "cache-control": "max-age=60", expires: "Thu, 01 Jan 1970 00:00:00 GMT" }, NOW)).toBe(60_000);
    expect(freshForMs(200, { "cache-control": "max-age=60", age: "50" }, NOW)).toBe(10_000);
    expect(freshForMs(200, { "cache-control": "max-age=60", age: "60" }, NOW)).toBeNull();
  });

  it("uses Expires against the response's own Date", () => {
    const expires = new Date(NOW + 120_000).toUTCString();
    expect(freshForMs(200, { date: DATE, expires }, NOW + 999_999)).toBe(120_000);
    expect(freshForMs(200, { date: DATE, expires: DATE }, NOW)).toBeNull();
    expect(freshForMs(200, { expires: "0" }, NOW)).toBeNull();
  });

  it("gives a Last-Modified response a tenth of its age, and an ETag alone nothing", () => {
    const tenDaysAgo = new Date(NOW - 10 * 86_400_000).toUTCString();
    expect(freshForMs(200, { date: DATE, "last-modified": tenDaysAgo }, NOW)).toBe(86_400_000);
    expect(freshForMs(200, { etag: '"abc"' }, NOW)).toBeNull();
    expect(freshForMs(200, {}, NOW)).toBeNull();
  });

  it("refuses what a browser would not reuse without asking", () => {
    for (const headers of [
      { "cache-control": "no-store, max-age=60" },
      { "cache-control": "no-cache, max-age=60" },
      { "cache-control": "max-age=abc" },
      { pragma: "no-cache", expires: new Date(NOW + 60_000).toUTCString() },
      { "cache-control": "max-age=60", vary: "Accept-Encoding, *" },
      { "cache-control": "max-age=60", "set-cookie": "a=1" },
    ]) {
      expect(freshForMs(200, headers, NOW), JSON.stringify(headers)).toBeNull();
    }
    expect(freshForMs(206, year, NOW)).toBeNull();
    expect(freshForMs(304, year, NOW)).toBeNull();
  });

  it("stores private responses, since the cache serves one store's scan", () => {
    expect(freshForMs(200, { "cache-control": "private, max-age=60" }, NOW)).toBe(60_000);
  });

  it("stores only the request types it keeps", () => {
    expect(reusableForMs(css(), 200, { "cache-control": "max-age=60" }, NOW)).toBe(60_000);
    expect(reusableForMs(css({ resourceType: "fetch" }), 200, { "cache-control": "max-age=60" }, NOW)).toBeNull();
  });

  it("drops headers that describe the transfer", () => {
    expect(replayHeaders({ "content-encoding": "gzip", "content-length": "9", "transfer-encoding": "chunked", ":status": "200", "content-type": "text/css", etag: "x" })).toEqual({
      "content-type": "text/css",
      etag: "x",
    });
  });
});

describe("the asset cache", () => {
  it("stores responses to GET requests for CSS, JS and fonts over HTTP only", () => {
    for (const resourceType of ["stylesheet", "script", "font"]) expect(AssetCache.stores(css({ resourceType }))).toBe(true);
    for (const resourceType of ["document", "image", "media", "fetch", "xhr"]) expect(AssetCache.stores(css({ resourceType }))).toBe(false);
    expect(AssetCache.stores(css({ method: "POST" }))).toBe(false);
    expect(AssetCache.stores(css({ url: "data:text/css,a" }))).toBe(false);
  });

  it("serves CSS, JS, fonts, and XHR or fetch reads of them, but not pages or ranges", () => {
    for (const resourceType of ["stylesheet", "script", "font", "xhr", "fetch"]) expect(AssetCache.serves(css({ resourceType }))).toBe(true);
    for (const resourceType of ["document", "image", "media"]) expect(AssetCache.serves(css({ resourceType }))).toBe(false);
    expect(AssetCache.serves(css({ method: "POST", resourceType: "fetch" }))).toBe(false);
    expect(AssetCache.serves(css({ headers: { range: "bytes=0-9" } }))).toBe(false);
  });

  it("serves a stored response with its status, headers and body", () => {
    const cache = new AssetCache(undefined, () => NOW);
    expect(cache.get(css())).toBeNull();
    expect(cache.put(css(), 200, { ...year, "content-encoding": "gzip", "content-length": "3" }, body)).toBe("stored");
    expect(cache.get(css())).toEqual({ status: 200, headers: year, body });
    expect(cache.get(css({ url: "https://store.test/cdn/other.css" }))).toBeNull();
    expect(cache.get(css({ resourceType: "document" }))).toBeNull();
    expect(cache.size).toBe(1);
  });

  it("does not store what it must not reuse", () => {
    const cache = new AssetCache(undefined, () => NOW);
    expect(cache.put(css(), 200, { "cache-control": "no-store" }, body)).toBe("not cacheable");
    expect(cache.put(css({ resourceType: "document" }), 200, year, body)).toBe("not cacheable");
    expect(cache.put(css({ resourceType: "xhr" }), 200, year, body)).toBe("not cacheable");
    expect(cache.get(css())).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("answers a CORS read only from a copy that allows its origin", () => {
    const cache = new AssetCache(undefined, () => NOW);
    const read = (url: string) => css({ url, resourceType: "xhr", headers: { origin: "https://store.test" } });
    // A stylesheet from another host, loaded without CORS, then read by axe.
    cache.put(css({ url: "https://cdn.test/open.css" }), 200, { ...year, "access-control-allow-origin": "*" }, body);
    cache.put(css({ url: "https://cdn.test/closed.css" }), 200, year, body);
    expect(cache.get(read("https://cdn.test/open.css"))).not.toBeNull();
    expect(cache.get(read("https://cdn.test/closed.css"))).toBeNull();
    // A copy fetched for the same origin fits that origin, and no other.
    cache.put(css({ url: "https://cdn.test/font.woff2", resourceType: "font", headers: { origin: "https://store.test" } }), 200, year, body);
    expect(cache.get(read("https://cdn.test/font.woff2"))).not.toBeNull();
    expect(cache.get(css({ url: "https://cdn.test/font.woff2", resourceType: "font", headers: { origin: "https://other.test" } }))).toBeNull();
    // A request without Origin does no CORS check, so any copy fits.
    expect(cache.get(css({ url: "https://cdn.test/closed.css" }))).not.toBeNull();
  });

  it("drops an entry once it goes stale", () => {
    let now = NOW;
    const cache = new AssetCache(undefined, () => now);
    cache.put(css(), 200, { "cache-control": "max-age=10" }, body);
    now += 9_999;
    expect(cache.get(css())).not.toBeNull();
    now += 1;
    expect(cache.get(css())).toBeNull();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });

  it("matches the request headers named in Vary", () => {
    const cache = new AssetCache(undefined, () => NOW);
    const font = css({ resourceType: "font", url: "https://cdn.test/a.woff2", headers: { origin: "https://store.test", "accept-language": "en" } });
    cache.put(font, 200, { ...year, vary: "Accept-Language, Origin" }, body);
    expect(cache.get(font)).not.toBeNull();
    expect(cache.get({ ...font, headers: { origin: "https://store.test", "accept-language": "fr" } })).toBeNull();
    expect(cache.get({ ...font, headers: { "accept-language": "en" } })).toBeNull();
    // A second variant is kept beside the first.
    cache.put({ ...font, headers: { origin: "https://store.test", "accept-language": "fr" } }, 200, { ...year, vary: "Accept-Language, Origin" }, body);
    expect(cache.size).toBe(2);
    expect(cache.get(font)).not.toBeNull();
  });

  it("keeps each entry and the whole store under their caps", () => {
    const cache = new AssetCache({ maxEntryBytes: 100, maxTotalBytes: 250 }, () => NOW);
    const headers = { "cache-control": "max-age=60" };
    const headerBytes = "cache-control".length + "max-age=60".length;
    const of = (n: number) => Buffer.alloc(n - headerBytes, "a");
    expect(cache.put(css({ url: "https://s.test/big.js" }), 200, headers, of(101))).toBe("too large");
    expect(cache.put(css({ url: "https://s.test/1.css" }), 200, headers, of(100))).toBe("stored");
    expect(cache.put(css({ url: "https://s.test/2.css" }), 200, headers, of(100))).toBe("stored");
    expect(cache.put(css({ url: "https://s.test/3.css" }), 200, headers, of(100))).toBe("full");
    expect(cache.bytes).toBe(200);
    // Replacing an entry frees its old size first.
    expect(cache.put(css({ url: "https://s.test/2.css" }), 200, headers, of(90))).toBe("stored");
    expect(cache.bytes).toBe(190);
    expect(cache.size).toBe(2);
  });

  it("gives each cache its own entries", () => {
    const a = new AssetCache(undefined, () => NOW);
    const b = new AssetCache(undefined, () => NOW);
    a.put(css(), 200, year, body);
    expect(a.get(css())).not.toBeNull();
    expect(b.get(css())).toBeNull();
  });
});
