import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pinnedFetch, startEgressProxy } from "../../../app/lib/scanner/egress";
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
