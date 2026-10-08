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
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; redirect: "manual"; signal?: AbortSignal },
) => Promise<FetchLikeResponse>;

export const DEFAULT_PORTS = [80, 443];

export function portOf(u: URL): number {
  return Number(u.port) || (u.protocol === "https:" ? 443 : 80);
}

// Decoded size is capped too, so a small compressed body cannot expand to
// fill memory.
function decode(body: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  const opts = { maxOutputLength: maxBytes };
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.gunzipSync(body, opts);
    case "deflate":
      return zlib.inflateSync(body, opts);
    case "br":
      return zlib.brotliDecompressSync(body, opts);
    default:
      return body;
  }
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
            reject(new Error(`response over ${maxBytes} bytes`));
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (tooBig) return;
          let body: Buffer;
          try {
            body = decode(Buffer.concat(chunks), res.headers["content-encoding"], maxBytes);
          } catch (err) {
            return reject(err);
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: {
              get(name) {
                const v = res.headers[name.toLowerCase()];
                return v === undefined ? null : Array.isArray(v) ? v.join(", ") : String(v);
              },
            },
            text: async () => body.toString("utf8"),
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

  server.on("connect", async (req: http.IncomingMessage, client: Duplex, head: Buffer) => {
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
    const upstream = net.connect({ host, port: Number(port), lookup: pinnedLookup(addresses) as unknown as net.LookupFunction }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
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
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
