// A store's CSS, JS and fonts, kept in memory for one census scan (T-025).
//
// Playwright turns the browser's HTTP cache off as soon as a route is set,
// and the census routes every request. Without this cache each of a store's
// pages would fetch all of its CSS and JS again. A visitor's browser keeps
// them, so the census does too.
//
// One cache serves one browser context, which is one store, and dies with
// it. It holds only responses the browser already fetched through the
// census's own network path. The rules follow HTTP caching (RFC 9111) as a
// browser applies it, cut down to the safe side: when in doubt, it does not
// store. It never revalidates, so a response that needs revalidation is not
// stored at all.

// Responses to these request types are stored. Images and media are
// blocked before they reach the cache; pages are always fetched fresh.
export const STORED_TYPES: ReadonlySet<string> = new Set(["stylesheet", "script", "font"]);

// Requests of these types may be answered from a stored copy. axe-core reads
// each cross-origin stylesheet again by XHR on every page (its CSSOM
// preload), so XHR and fetch may reuse the copy the page loaded. Nothing
// they fetch from the network is stored.
export const SERVED_TYPES: ReadonlySet<string> = new Set([...STORED_TYPES, "xhr", "fetch"]);

export interface AssetCacheLimits {
  // The largest entry stored: decoded body plus headers.
  maxEntryBytes: number;
  // All entries for one store together.
  maxTotalBytes: number;
}

export const ASSET_CACHE_LIMITS: AssetCacheLimits = { maxEntryBytes: 5_000_000, maxTotalBytes: 20_000_000 };

// Header names are lower case, as Playwright gives them.
export type HeaderMap = Record<string, string>;

export interface AssetRequest {
  method: string;
  url: string;
  resourceType: string;
  headers: HeaderMap;
}

// What route.fulfill needs to answer a request from the cache.
export interface CachedAsset {
  status: number;
  headers: HeaderMap;
  body: Buffer;
}

export type StoreResult = "stored" | "not cacheable" | "too large" | "full";

interface Entry extends CachedAsset {
  // Values of the request headers the response's Vary names.
  vary: HeaderMap;
  // The Origin header of the request that fetched it, or "".
  origin: string;
  expiresAt: number;
  bytes: number;
}

// These describe how the body was sent, not the body. The cache holds it
// decoded, so they would be wrong on replay. Names starting with ":" are
// HTTP/2 pseudo-headers.
const TRANSFER_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

export function parseCacheControl(value: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (value ?? "").split(",")) {
    const eq = part.indexOf("=");
    const name = (eq < 0 ? part : part.slice(0, eq)).trim().toLowerCase();
    if (!name || out.has(name)) continue;
    out.set(name, eq < 0 ? "" : part.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1"));
  }
  return out;
}

function seconds(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

function httpDate(value: string | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

// How many more milliseconds a response may be reused without asking the
// server, or null when it must not be stored at all.
export function freshForMs(status: number, headers: HeaderMap, now: number): number | null {
  if (status !== 200) return null;
  const cc = parseCacheControl(headers["cache-control"]);
  // no-cache means "ask the server every time", which this cache never does.
  // `private` is fine: the cache serves one store's scan, as a visitor's
  // browser serves one visitor, and is never shared.
  if (cc.has("no-store") || cc.has("no-cache")) return null;
  if (headers["cache-control"] === undefined && /no-cache/i.test(headers["pragma"] ?? "")) return null;
  if ((headers["vary"] ?? "").split(",").some((v) => v.trim() === "*")) return null;
  // A replayed response must not set cookies again.
  if (headers["set-cookie"] !== undefined) return null;
  const date = httpDate(headers["date"]) ?? now;
  let lifetime: number;
  if (cc.has("max-age")) {
    const maxAge = seconds(cc.get("max-age"));
    if (maxAge === null) return null;
    lifetime = maxAge * 1000;
  } else if (headers["expires"] !== undefined) {
    const expires = httpDate(headers["expires"]);
    if (expires === null) return null;
    lifetime = expires - date;
  } else if (headers["last-modified"] !== undefined) {
    // No stated lifetime: a tenth of the time since the file last changed,
    // as browsers do (RFC 9111, section 4.2.2).
    const modified = httpDate(headers["last-modified"]);
    if (modified === null || modified > date) return null;
    lifetime = (date - modified) / 10;
  } else {
    // An ETag alone gives no lifetime. A browser would ask the server again
    // on every page, so this cache does not store it.
    return null;
  }
  // The response's age: the larger of the Age header and the time since its
  // Date (RFC 9111, section 4.2.3). A server clock ahead of ours counts as 0.
  const age = Math.max(Math.max(0, now - date), (seconds(headers["age"]) ?? 0) * 1000);
  const left = lifetime - age;
  return left > 0 ? left : null;
}

// How long the response to `req` may be reused, or null when it must not
// be stored. The census checks this before it reads a body.
export function reusableForMs(req: AssetRequest, status: number, headers: HeaderMap, now: number): number | null {
  return AssetCache.stores(req) ? freshForMs(status, headers, now) : null;
}

// The response headers to replay from the cache.
export function replayHeaders(headers: HeaderMap): HeaderMap {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !TRANSFER_HEADERS.has(k) && !k.startsWith(":")));
}

function varyNames(headers: HeaderMap): string[] {
  const names = (headers["vary"] ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(names)];
}

function sizeOf(headers: HeaderMap, body: Buffer): number {
  let n = body.length;
  for (const [k, v] of Object.entries(headers)) n += k.length + v.length;
  return n;
}

function isGet(req: Pick<AssetRequest, "method" | "url">): boolean {
  return req.method === "GET" && /^https?:/i.test(req.url);
}

export class AssetCache {
  private entries = new Map<string, Entry[]>();
  private total = 0;

  constructor(
    readonly limits: AssetCacheLimits = ASSET_CACHE_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  // Whether a response to this request may be stored.
  static stores(req: Pick<AssetRequest, "method" | "url" | "resourceType">): boolean {
    return isGet(req) && STORED_TYPES.has(req.resourceType);
  }

  // Whether this request may be answered from a stored copy.
  static serves(req: AssetRequest): boolean {
    return isGet(req) && SERVED_TYPES.has(req.resourceType) && req.headers["range"] === undefined;
  }

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    let n = 0;
    for (const list of this.entries.values()) n += list.length;
    return n;
  }

  // A fresh stored response for the request, or null. Expired entries are
  // dropped on the way.
  get(req: AssetRequest): CachedAsset | null {
    if (!AssetCache.serves(req)) return null;
    const list = this.entries.get(req.url);
    if (!list) return null;
    const now = this.now();
    for (const e of [...list]) {
      if (e.expiresAt <= now) {
        this.remove(req.url, e);
        continue;
      }
      if (this.fits(e, req.headers)) return { status: e.status, headers: { ...e.headers }, body: e.body };
    }
    return null;
  }

  // Stores a response the browser fetched for `req`. Anything that is not
  // clearly reusable, or that would break a limit, is left out.
  put(req: AssetRequest, status: number, headers: HeaderMap, body: Buffer): StoreResult {
    const now = this.now();
    const fresh = reusableForMs(req, status, headers, now);
    if (fresh === null) return "not cacheable";
    const replay = replayHeaders(headers);
    const bytes = sizeOf(replay, body);
    if (bytes > this.limits.maxEntryBytes) return "too large";
    const vary = Object.fromEntries(varyNames(headers).map((k) => [k, req.headers[k] ?? ""]));
    const origin = req.headers["origin"] ?? "";
    const old = (this.entries.get(req.url) ?? []).find((e) => e.origin === origin && sameVary(e.vary, vary));
    if (this.total - (old?.bytes ?? 0) + bytes > this.limits.maxTotalBytes) return "full";
    if (old) this.remove(req.url, old);
    const entry: Entry = { status, headers: replay, body, vary, origin, expiresAt: now + fresh, bytes };
    this.entries.set(req.url, [...(this.entries.get(req.url) ?? []), entry]);
    this.total += bytes;
    return "stored";
  }

  // A stored copy fits a request when the headers its Vary names match. A
  // CORS request (one with an Origin header) also needs a copy that allows
  // its origin: fetched for that same origin, or sent with
  // Access-Control-Allow-Origin: *. Otherwise it goes to the network.
  private fits(e: Entry, headers: HeaderMap): boolean {
    if (!Object.entries(e.vary).every(([k, v]) => (headers[k] ?? "") === v)) return false;
    const origin = headers["origin"] ?? "";
    return !origin || origin === e.origin || e.headers["access-control-allow-origin"]?.trim() === "*";
  }

  private remove(url: string, e: Entry) {
    const list = (this.entries.get(url) ?? []).filter((x) => x !== e);
    if (list.length) this.entries.set(url, list);
    else this.entries.delete(url);
    this.total -= e.bytes;
  }
}

function sameVary(a: HeaderMap, b: HeaderMap): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}
