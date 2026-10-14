import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ContentEncodingError, pinnedFetch, ResponseTooLargeError, startEgressProxy } from "../../../app/lib/scanner/egress";
import { BlockedAddressError, isPublicAddress, resolvePublic } from "../../../app/lib/scanner/netguard";
import { PoliteClient } from "../../../app/lib/scanner/polite";

let target: http.Server;
let port: number;

beforeAll(async () => {
  target = http.createServer((req, res) => res.end(`hello ${req.headers.host} ${req.url}`));
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  port = (target.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((r) => target.close(() => r())));

const toLocal = async () => ["127.0.0.1"];

describe("address rules", () => {
  it("allows global unicast IPv6 only", () => {
    for (const ip of [
      "::", "::1", "fe80::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1",
      "2001:db8::1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "3fff::1", "100::1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["2606:4700::6810:84e5", "2a00:1450:4001:82a::200e", "2620:127:f00f:e::"]) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it("blocks the 6to4 relay range and keeps public IPv4", () => {
    expect(isPublicAddress("192.88.99.1")).toBe(false);
    expect(isPublicAddress("23.227.38.65")).toBe(true);
  });

  it("refuses a host when any of its addresses is private", async () => {
    await expect(resolvePublic("mixed.example", { lookup: async () => ["93.184.216.34", "10.0.0.1"] })).rejects.toThrow(BlockedAddressError);
    await expect(resolvePublic("none.example", { lookup: async () => [] })).rejects.toThrow(/no address/);
    expect(await resolvePublic("[2606:4700::1]")).toEqual(["2606:4700::1"]);
  });
});

describe("pinnedFetch", () => {
  const headers = { "user-agent": "test" };

  it("fetches through a vetted address when private ones are allowed for tests", async () => {
    const res = await pinnedFetch({ lookup: toLocal, allowPrivate: true })(`http://store.test:${port}/a?b=1`, { headers, redirect: "manual" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`hello store.test:${port} /a?b=1`);
  });

  it("refuses private addresses, by name or by literal", async () => {
    const f = pinnedFetch({ lookup: toLocal });
    await expect(f(`http://store.test:${port}/`, { headers, redirect: "manual" })).rejects.toThrow(BlockedAddressError);
    await expect(f(`http://127.0.0.1:${port}/`, { headers, redirect: "manual" })).rejects.toThrow(BlockedAddressError);
  });

  it("checks the address again at connect time, so DNS rebinding fails", async () => {
    const answers = [["93.184.216.34"], ["127.0.0.1"]];
    const lookup = async () => answers.shift() ?? ["127.0.0.1"];
    await expect(pinnedFetch({ lookup })(`http://rebind.test:${port}/`, { headers, redirect: "manual" })).rejects.toThrow(/non-public/);
  });

  it("stops reading a body over the cap", async () => {
    const f = pinnedFetch({ lookup: toLocal, allowPrivate: true, maxBytes: 5 });
    await expect(f(`http://store.test:${port}/long`, { headers, redirect: "manual" })).rejects.toThrow(/over 5 bytes/);
    await expect(f(`http://store.test:${port}/long`, { headers, redirect: "manual" })).rejects.toThrow(ResponseTooLargeError);
  });

  it("stops a compressed body that expands past the cap, and gives the decoded body and every header", async () => {
    // About 10 KB of gzip that expands to 10 MB, and a small page with two cookies.
    const bomb = zlib.gzipSync(Buffer.alloc(10_000_000));
    const page = zlib.gzipSync(Buffer.from("héllo", "latin1"));
    const srv = http.createServer((req, res) => {
      if (req.url === "/bomb") return res.writeHead(200, { "content-encoding": "gzip" }).end(bomb);
      res.writeHead(200, [["content-encoding", "gzip"], ["set-cookie", "a=1"], ["set-cookie", "b=2"], ["content-type", "text/html; charset=windows-1252"]]);
      res.end(page);
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const p = (srv.address() as AddressInfo).port;
    try {
      const f = pinnedFetch({ lookup: toLocal, allowPrivate: true, maxBytes: 1_000_000 });
      expect(bomb.length).toBeLessThan(1_000_000);
      await expect(f(`http://store.test:${p}/bomb`, { headers, redirect: "manual" })).rejects.toThrow(ResponseTooLargeError);
      const res = await f(`http://store.test:${p}/page`, { headers, redirect: "manual" });
      expect(await res.decodedBody!()).toEqual(Buffer.from("héllo", "latin1"));
      expect(res.headerList!.filter(([k]) => k === "set-cookie")).toEqual([
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ]);
    } finally {
      srv.close();
    }
  });

  describe("content-encodings, as Chromium decodes them (T-029)", () => {
    const html = Buffer.from(`<!doctype html><html lang="en"><head><title>Shirts</title></head><body><h1>Shirts</h1></body></html>`);
    const gz = (b: Buffer, level?: number) => zlib.gzipSync(b, level === undefined ? {} : { level });
    const br = (b: Buffer) => zlib.brotliCompressSync(b);

    // Each path answers with its own status, content-encoding header lines
    // and body. Two strings mean two header lines.
    type Route = { status?: number; encodings: string[]; body: Buffer; location?: string };
    async function serve(routes: Record<string, Route>) {
      const srv = http.createServer((req, res) => {
        const r = routes[req.url ?? ""];
        if (!r) return res.writeHead(404).end();
        const lines: [string, string][] = [["content-type", "text/html"], ...r.encodings.map((e): [string, string] => ["content-encoding", e])];
        if (r.location) lines.push(["location", r.location]);
        res.writeHead(r.status ?? 200, lines).end(r.body);
      });
      await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
      const p = (srv.address() as AddressInfo).port;
      return {
        get: (path: string, maxBytes = 1_000_000) => pinnedFetch({ lookup: toLocal, allowPrivate: true, maxBytes })(`http://store.test:${p}${path}`, { headers, redirect: "manual" }),
        close: () => srv.close(),
      };
    }

    it("decodes `gzip, gzip`, in one header line or two", async () => {
      const srv = await serve({
        "/one": { encodings: ["gzip, gzip"], body: gz(gz(html)) },
        "/two": { encodings: ["gzip", "gzip"], body: gz(gz(html)) },
      });
      try {
        for (const path of ["/one", "/two"]) {
          const res = await srv.get(path);
          expect(await res.decodedBody!(), path).toEqual(html);
          expect(await res.text(), path).toBe(html.toString());
        }
      } finally {
        srv.close();
      }
    });

    it("decodes deflate with or without its zlib header", async () => {
      // Raw deflate breaks the RFC, but Chromium accepts it.
      const srv = await serve({
        "/raw": { encodings: ["deflate"], body: zlib.deflateRawSync(html) },
        "/zlib": { encodings: ["deflate"], body: zlib.deflateSync(html) },
      });
      try {
        expect(await (await srv.get("/raw")).decodedBody!()).toEqual(html);
        expect(await (await srv.get("/zlib")).decodedBody!()).toEqual(html);
      } finally {
        srv.close();
      }
    });

    it("decodes br alone and stacked with gzip, the last one applied first", async () => {
      const srv = await serve({
        "/br": { encodings: ["br"], body: br(html) },
        // "gzip, br": gzip was applied first, then br.
        "/gzip-br": { encodings: ["gzip, br"], body: br(gz(html)) },
        "/br-gzip": { encodings: ["br, gzip"], body: gz(br(html)) },
        // Names in any case, x-gzip, and identity, which changes nothing.
        "/names": { encodings: ["X-Gzip", "identity, Br"], body: br(gz(html)) },
      });
      try {
        for (const path of ["/br", "/gzip-br", "/br-gzip", "/names"]) expect(await (await srv.get(path)).decodedBody!(), path).toEqual(html);
      } finally {
        srv.close();
      }
    });

    it("refuses an unknown encoding, too many layers or corrupt data, and never passes the bytes on still encoded", async () => {
      const srv = await serve({
        "/zstd": { encodings: ["zstd"], body: gz(html) },
        "/gzip-zstd": { encodings: ["gzip, zstd"], body: gz(html) },
        "/three": { encodings: ["gzip, gzip, gzip"], body: gz(gz(gz(html))) },
        "/four": { encodings: ["gzip, gzip, gzip, gzip"], body: gz(gz(gz(gz(html)))) },
        "/corrupt": { encodings: ["gzip"], body: Buffer.from("not gzip at all") },
        // A redirect's body is never read, so its encoding does not matter.
        "/moved": { status: 302, encodings: ["zstd"], body: Buffer.from("elsewhere"), location: "/three" },
      });
      try {
        for (const [path, why] of [["/zstd", /zstd/], ["/gzip-zstd", /zstd/], ["/four", /4 layers/], ["/corrupt", /gzip/]] as const) {
          // The status and headers are still there; reading the body fails.
          const res = await srv.get(path);
          expect(res.status, path).toBe(200);
          await expect(res.decodedBody!(), path).rejects.toThrow(ContentEncodingError);
          await expect(res.decodedBody!(), path).rejects.toThrow(why);
          await expect(res.text(), path).rejects.toThrow(ContentEncodingError);
        }
        expect(await (await srv.get("/three")).decodedBody!()).toEqual(html);
        const moved = await srv.get("/moved");
        expect([moved.status, moved.headers.get("location")]).toEqual([302, "/three"]);
      } finally {
        srv.close();
      }
    });

    it("a stacked `gzip, gzip` bomb and a page over the cap on the wire each raise ResponseTooLargeError", async () => {
      // The middle layer is 20 MB of stored (uncompressed) gzip, the last
      // layer 20 MB of zeros. Each is a few KB on the wire.
      const zeros = Buffer.alloc(20_000_000);
      const srv = await serve({
        "/middle": { encodings: ["gzip, gzip"], body: gz(gz(zeros, 0), 9) },
        "/last": { encodings: ["gzip, gzip"], body: gz(gz(zeros, 9), 9) },
        "/wire": { encodings: ["gzip, gzip"], body: crypto.randomBytes(1_000_001) },
      });
      const gunzip = vi.spyOn(zlib, "gunzipSync");
      try {
        for (const path of ["/middle", "/last"]) {
          gunzip.mockClear();
          await expect(srv.get(path), path).rejects.toThrow(ResponseTooLargeError);
          await expect(srv.get(path), path).rejects.toThrow(/once decompressed/);
          // No layer may produce more than the cap: the middle layer is never
          // decoded whole into memory.
          for (const [, opts] of gunzip.mock.calls) expect(opts?.maxOutputLength, path).toBeLessThanOrEqual(1_000_000);
        }
        // The middle-layer bomb stops in the first layer decoded.
        gunzip.mockClear();
        await expect(srv.get("/middle")).rejects.toThrow(ResponseTooLargeError);
        expect(gunzip).toHaveBeenCalledTimes(1);
        // Over the cap as sent: refused before any decoding.
        gunzip.mockClear();
        await expect(srv.get("/wire")).rejects.toThrow(ResponseTooLargeError);
        await expect(srv.get("/wire")).rejects.toThrow(/over 1000000 bytes$/);
        expect(gunzip).not.toHaveBeenCalled();
      } finally {
        gunzip.mockRestore();
        srv.close();
      }
    });

    it("stops a zlib deflate bomb as too large, without retrying it as raw deflate", async () => {
      const srv = await serve({ "/": { encodings: ["deflate"], body: zlib.deflateSync(Buffer.alloc(20_000_000)) } });
      const raw = vi.spyOn(zlib, "inflateRawSync");
      try {
        await expect(srv.get("/")).rejects.toThrow(ResponseTooLargeError);
        expect(raw).not.toHaveBeenCalled();
      } finally {
        raw.mockRestore();
        srv.close();
      }
    });

    it("holds the decoded cap across all layers together, not per layer", async () => {
      // 600 KB that does not compress: each layer is about 600 KB, so the
      // two decoded layers make 1.2 MB, though each is under 1 MB.
      const page = crypto.randomBytes(600_000);
      const srv = await serve({ "/": { encodings: ["gzip, gzip"], body: gz(gz(page)) } });
      try {
        await expect(srv.get("/", 1_000_000)).rejects.toThrow(ResponseTooLargeError);
        // Buffer.equals: a deep compare of 600 KB takes seconds.
        expect((await (await srv.get("/", 1_300_000)).decodedBody!()).equals(page)).toBe(true);
      } finally {
        srv.close();
      }
    });
  });

  it("is the PoliteClient default, so the client refuses non-standard ports", async () => {
    const client = new PoliteClient({ contact: "a@b.co", lookup: async () => ["93.184.216.34"] });
    await expect(client.checkUrl("http://store.example:8080/")).rejects.toThrow(/port 8080/);
  });
});

function viaProxy(proxyUrl: string, url: string): Promise<{ status: number; body: string }> {
  const p = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: p.hostname, port: p.port, path: url, headers: { host: new URL(url).host } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

function connectVia(proxyUrl: string, authority: string): Promise<string> {
  const p = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(p.port), p.hostname, () => {
      sock.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    let data = "";
    sock.on("data", (c) => {
      data += c;
      if (data.startsWith("HTTP/1.1 200") && data.includes("\r\n\r\n") && !data.includes("hello")) {
        sock.write(`GET /tunnel HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`);
      }
    });
    sock.on("end", () => resolve(data));
    sock.on("close", () => resolve(data));
    sock.on("error", reject);
  });
}

describe("egress proxy", () => {
  it("forwards plain HTTP and tunnels CONNECT to vetted addresses", async () => {
    const proxy = await startEgressProxy({ lookup: toLocal, allowPrivate: true, ports: "any" });
    try {
      const res = await viaProxy(proxy.server, `http://store.test:${port}/page`);
      expect(res).toEqual({ status: 200, body: `hello store.test:${port} /page` });
      const tunnel = await connectVia(proxy.server, `store.test:${port}`);
      expect(tunnel).toMatch(/^HTTP\/1\.1 200/);
      expect(tunnel).toContain(`hello store.test:${port} /tunnel`);
      expect(proxy.blocked.size).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  it("refuses private addresses and non-standard ports, and records the host", async () => {
    const proxy = await startEgressProxy({ lookup: toLocal });
    try {
      expect((await viaProxy(proxy.server, `http://store.test/`)).status).toBe(403);
      expect(await connectVia(proxy.server, "metadata.test:443")).toMatch(/^HTTP\/1\.1 403/);
      expect(await connectVia(proxy.server, `127.0.0.1:${port}`)).toMatch(/^HTTP\/1\.1 403/);
      expect([...proxy.blocked].sort()).toEqual(["127.0.0.1", "metadata.test", "store.test"]);
    } finally {
      await proxy.close();
    }
    const strict = await startEgressProxy({ lookup: async () => ["93.184.216.34"] });
    try {
      expect(await connectVia(strict.server, "store.example:8443")).toMatch(/^HTTP\/1\.1 403/);
    } finally {
      await strict.close();
    }
  });

  it("closes while a CONNECT tunnel is still open, and ends the tunnel", async () => {
    // Every HTTPS request goes through a tunnel. A browser keeps them open,
    // and close() used to wait for them, so the census hung after an
    // HTTPS store (T-027).
    const proxy = await startEgressProxy({ lookup: toLocal, allowPrivate: true, ports: "any" });
    const p = new URL(proxy.server);
    const sock = net.connect(Number(p.port), p.hostname);
    const ended = new Promise<void>((r) => sock.on("close", () => r()));
    await new Promise<void>((resolve) => {
      sock.on("connect", () => sock.write(`CONNECT store.test:${port} HTTP/1.1\r\nHost: store.test:${port}\r\n\r\n`));
      sock.once("data", () => resolve());
    });
    const closed = await Promise.race([proxy.close().then(() => "closed"), new Promise((r) => setTimeout(() => r("still open after 2 s"), 2000))]);
    expect(closed).toBe("closed");
    await ended;
  });
});

describe("hostile upstreams", () => {
  it("answers 502 for an invalid status and keeps serving", async () => {
    const bad = net.createServer((sock) => sock.end("HTTP/1.1 000 OK\r\nContent-Length: 0\r\n\r\n"));
    await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
    const badPort = (bad.address() as AddressInfo).port;
    const proxy = await startEgressProxy({ lookup: toLocal, allowPrivate: true, ports: "any" });
    try {
      expect((await viaProxy(proxy.server, `http://bad.test:${badPort}/`)).status).toBe(502);
      expect((await viaProxy(proxy.server, `http://store.test:${port}/ok`)).status).toBe(200);
    } finally {
      await proxy.close();
      bad.close();
    }
  });

  it("caps the decoded size of a compressed body", async () => {
    const bomb = zlib.brotliCompressSync(Buffer.alloc(20_000_000));
    const srv = http.createServer((_q, r) => {
      r.writeHead(200, { "content-encoding": "br" });
      r.end(bomb);
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const p = (srv.address() as AddressInfo).port;
    try {
      const f = pinnedFetch({ lookup: toLocal, allowPrivate: true, maxBytes: 1_000_000 });
      expect(bomb.length).toBeLessThan(1_000_000);
      await expect(f(`http://bomb.test:${p}/`, { headers: {}, redirect: "manual" })).rejects.toThrow();
    } finally {
      srv.close();
    }
  });

  it("tries each vetted address in turn", async () => {
    // 127.0.0.2 refuses: the server listens on 127.0.0.1 only.
    const proxy = await startEgressProxy({ lookup: async () => ["127.0.0.2", "127.0.0.1"], allowPrivate: true, ports: "any" });
    try {
      expect(await connectVia(proxy.server, `store.test:${port}`)).toContain(`hello store.test:${port} /tunnel`);
      expect((await viaProxy(proxy.server, `http://store.test:${port}/x`)).status).toBe(200);
    } finally {
      await proxy.close();
    }
  });
});
