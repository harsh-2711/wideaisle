// The only ways the census reaches the network. Both resolve a host once,
// vet every address, then connect to a vetted address, so DNS rebinding
// cannot point a second lookup at a private one.
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import zlib from "node:zlib";
import { BlockedAddressError, guardedLookup, pinnedLookup, resolvePublic, type GuardOptions } from "./netguard";

export interface FetchLikeResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  // pinnedFetch also gives the decoded body as bytes and every header line,
  // for callers that pass the response on, such as the census's page loads.
  decodedBody?(): Promise<Buffer>;
  headerList?: [string, string][];
}

// A body over the fetch's cap, on the wire or after decompression.
export class ResponseTooLargeError extends Error {}

// A body that cannot be decoded: an encoding not decoded here, too many
// layers, or corrupt data. Its bytes are never handed on still encoded.
export class ContentEncodingError extends Error {}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; redirect: "manual"; signal?: AbortSignal },
) => Promise<FetchLikeResponse>;

export const DEFAULT_PORTS = [80, 443];

export function portOf(u: URL): number {
  return Number(u.port) || (u.protocol === "https:" ? 443 : 80);
}

// zlib stops at maxOutputLength with ERR_BUFFER_TOO_LARGE.
const overLimit = (err: unknown) => (err as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE";

// The content-encodings decoded, by the names Chromium accepts. "identity"
// means none.
const DECODERS = new Map<string, (body: Buffer, opts: zlib.ZlibOptions) => Buffer>([
  ["gzip", (b, o) => zlib.gunzipSync(b, o)],
  ["x-gzip", (b, o) => zlib.gunzipSync(b, o)],
  [
    "deflate",
    (b, o) => {
      // Some servers send raw deflate, with no zlib header. Chromium takes
      // it, so try the header first and then without.
      try {
        return zlib.inflateSync(b, o);
      } catch (err) {
        if (overLimit(err)) throw err;
        return zlib.inflateRawSync(b, o);
      }
    },
  ],
  ["br", (b, o) => zlib.brotliDecompressSync(b, o)],
]);

// More layers than this is not a real server's answer.
export const MAX_ENCODING_LAYERS = 3;

// Decodes every layer the Content-Encoding header lists, the last one
// applied first, as Chromium does (T-029). Decoded size is capped too, so a
// small compressed body cannot expand to fill memory. The cap covers all
// layers together: each layer may produce only what the earlier ones left,
// so a stacked bomb stops in whichever layer reaches it.
function decode(body: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  const layers = (encoding ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e !== "identity");
  const unknown = layers.find((e) => !DECODERS.has(e));
  if (unknown) throw new ContentEncodingError(`content-encoding ${unknown.slice(0, 40)} is not supported`);
  if (layers.length > MAX_ENCODING_LAYERS) throw new ContentEncodingError(`content-encoding has ${layers.length} layers, over ${MAX_ENCODING_LAYERS}`);
  const tooLarge = () => new ResponseTooLargeError(`response over ${maxBytes} bytes once decompressed`);
  let left = maxBytes;
  for (const layer of layers.reverse()) {
    // zlib takes no limit under 1 byte.
    if (left < 1) throw tooLarge();
    try {
      body = DECODERS.get(layer)!(body, { maxOutputLength: left });
    } catch (err) {
      if (overLimit(err)) throw tooLarge();
      throw new ContentEncodingError(`${layer} data is corrupt`);
    }
    left -= body.length;
  }
  return body;
}

// A small fetch for the census: GET only, no redirects followed, a cap on
// body size, and connections pinned to vetted addresses.
export function pinnedFetch(opts: GuardOptions & { maxBytes?: number } = {}): FetchLike {
  const lookup = guardedLookup(opts) as unknown as net.LookupFunction;
  const maxBytes = opts.maxBytes ?? 5_000_000;
  return async (url, init) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : u.protocol === "http:" ? http : null;
    if (!mod) throw new BlockedAddressError(`${u.protocol} is not crawled`);
    // Node skips `lookup` for IP literals, so vet those here.
    await resolvePublic(u.hostname, opts);
    return new Promise<FetchLikeResponse>((resolve, reject) => {
      const req = mod.request(u, { method: "GET", headers: init.headers, lookup, signal: init.signal, agent: false }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let tooBig = false;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            tooBig = true;
            reject(new ResponseTooLargeError(`response over ${maxBytes} bytes`));
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (tooBig) return;
          let decoded: Buffer | ContentEncodingError;
          try {
            decoded = decode(Buffer.concat(chunks), res.headers["content-encoding"], maxBytes);
          } catch (err) {
            // A body that cannot be decoded fails only when it is read, so a
            // caller can still follow a redirect, which has no body to read.
            if (!(err instanceof ContentEncodingError)) return reject(err);
            decoded = err;
          }
          const body = async () => {
            if (decoded instanceof ContentEncodingError) throw decoded;
            return decoded;
          };
          const headerList: [string, string][] = [];
          for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) headerList.push([res.rawHeaders[i].toLowerCase(), res.rawHeaders[i + 1]]);
          resolve({
            status: res.statusCode ?? 0,
            headers: {
              get(name) {
                const v = res.headers[name.toLowerCase()];
                return v === undefined ? null : Array.isArray(v) ? v.join(", ") : String(v);
              },
            },
            text: async () => (await body()).toString("utf8"),
            decodedBody: body,
            headerList,
          });
        });
      });
      req.on("error", reject);
      req.end();
    });
  };
}

export interface EgressProxy {
  // For Playwright's `proxy.server`.
  server: string;
  // Hosts the proxy refused, for the census record.
  blocked: Set<string>;
  close(): Promise<void>;
}

const HOP_BY_HOP = new Set(["proxy-connection", "proxy-authorization", "connection", "keep-alive", "upgrade", "te", "trailer", "transfer-encoding"]);

// A local HTTP proxy for the scan browser. Chromium sends every request
// through it, so the browser never resolves a store's host itself.
export async function startEgressProxy(opts: GuardOptions & { ports?: number[] | "any" } = {}): Promise<EgressProxy> {
  const ports = opts.ports ?? DEFAULT_PORTS;
  const blocked = new Set<string>();
  const portAllowed = (p: number) => ports === "any" || ports.includes(p);

  async function vet(host: string, port: number): Promise<string[]> {
    if (!portAllowed(port)) throw new BlockedAddressError(`port ${port} is not crawled`);
    return resolvePublic(host, opts);
  }

  const server = http.createServer(async (req, res) => {
    let u: URL;
    try {
      u = new URL(req.url ?? "");
      if (u.protocol !== "http:") throw new Error("absolute http URL expected");
    } catch {
      res.writeHead(400).end();
      return;
    }
    let addresses: string[];
    try {
      addresses = await vet(u.hostname, portOf(u));
    } catch {
      blocked.add(u.hostname);
      res.writeHead(403).end();
      return;
    }
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !HOP_BY_HOP.has(k)));
    const upstream = http.request(
      {
        host: u.hostname.replace(/^\[|\]$/g, ""),
        port: portOf(u),
        path: u.pathname + u.search,
        method: req.method,
        headers,
        agent: false,
        lookup: pinnedLookup(addresses) as unknown as net.LookupFunction,
      },
      (up) => {
        // A bad upstream answer must not take the census down with it.
        try {
          const code = up.statusCode && up.statusCode >= 100 && up.statusCode <= 599 ? up.statusCode : 502;
          const out = Object.fromEntries(Object.entries(up.headers).filter(([k]) => !HOP_BY_HOP.has(k)));
          res.writeHead(code, out);
          up.pipe(res);
        } catch {
          up.destroy();
          if (!res.headersSent) res.writeHead(502);
          res.end();
        }
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });

  // A CONNECT tunnel leaves the server's own connection tracking, and a
  // browser keeps tunnels open. close() ends them itself; otherwise it would
  // wait for as long as the browser holds one (T-027).
  const tunnels = new Set<Duplex>();
  const track = (s: Duplex) => {
    tunnels.add(s);
    s.on("close", () => tunnels.delete(s));
  };

  server.on("connect", async (req: http.IncomingMessage, client: Duplex, head: Buffer) => {
    track(client);
    client.on("error", () => client.destroy());
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url ?? "");
    if (!m) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const [, host, port] = m;
    let addresses: string[];
    try {
      addresses = await vet(host, Number(port));
    } catch {
      blocked.add(host);
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    if (client.destroyed) return;
    const upstream = net.connect({ host, port: Number(port), lookup: pinnedLookup(addresses) as unknown as net.LookupFunction }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    track(upstream);
    upstream.on("error", () => client.destroy());
    client.on("close", () => upstream.destroy());
  });

  // WebSockets are blocked in the browser; refuse any that get here.
  server.on("upgrade", (_req, socket: Duplex) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    server: `http://127.0.0.1:${port}`,
    blocked,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
        for (const s of tunnels) s.destroy();
      }),
  };
}
