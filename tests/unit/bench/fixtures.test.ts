import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleLinks } from "../../../app/lib/scanner/detect";
import {
  generateStore,
  mulberry32,
  serveFixtures,
  storeHost,
  writeFixtures,
  type FixtureServer,
} from "../../../scripts/bench/fixtures";

describe("bench fixtures", () => {
  it("are the same for the same seed and differ between stores", () => {
    const a = generateStore(7, 3);
    const b = generateStore(7, 3);
    expect(a.files.map((f) => f.body)).toEqual(b.files.map((f) => f.body));
    const c = generateStore(7, 4);
    expect(c.files.find((f) => f.file === "home.html")!.body).not.toBe(
      a.files.find((f) => f.file === "home.html")!.body,
    );
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });

  it("weigh about what a Shopify page does", () => {
    for (let i = 0; i < 8; i++) {
      const store = generateStore(1, i);
      expect(store.pages.map((p) => p.kind)).toEqual([
        "home",
        "collection",
        "product",
        "cart",
      ]);
      for (const p of store.pages) {
        expect(p.totalBytes).toBeGreaterThan(300 * 1024);
        expect(p.totalBytes).toBeLessThan(1.6 * 1024 * 1024);
        expect(p.htmlBytes).toBeGreaterThan(40 * 1024);
      }
    }
  });

  it("ship scripts that parse and pages the census can follow", () => {
    const store = generateStore(1, 0);
    for (const f of store.files.filter((x) => x.file.endsWith(".js"))) {
      expect(() => new vm.Script(f.body, { filename: f.file })).not.toThrow();
    }
    const home = store.files.find((f) => f.file === "home.html")!.body;
    expect(home).toMatch(/Shopify\.theme = \{/);
    // Every home page links to a collection and a product, so each store
    // gives the census all four pages.
    for (let i = 0; i < 60; i++) {
      const page = generateStore(1, i).files.find(
        (f) => f.file === "home.html",
      )!.body;
      const links = sampleLinks(page, `http://${storeHost(i)}`);
      expect(links.collection, `store ${i}`).toMatch(
        /^\/collections\/[a-z0-9-]+$/,
      );
      expect(links.product, `store ${i}`).toMatch(/^\/products\/[a-z0-9-]+$/);
    }
    expect(home).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("bench fixture server", () => {
  let dir: string;
  let server: FixtureServer;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-bench-"));
    const manifest = writeFixtures(dir, 1, 2);
    server = await serveFixtures(dir, manifest);
  });

  afterAll(async () => {
    await server?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function get(
    host: string,
    urlPath: string,
  ): Promise<{ status: number; type: string; body: string }> {
    return new Promise((resolve, reject) => {
      http
        .get(
          {
            host: "127.0.0.1",
            port: server.port,
            path: urlPath,
            headers: { host: `${host}:${server.port}` },
          },
          (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (c) => (body += c));
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                type: String(res.headers["content-type"]),
                body,
              }),
            );
          },
        )
        .on("error", reject);
    });
  }

  it("picks the store by host name and serves its pages and assets", async () => {
    const home0 = await get(storeHost(0), "/");
    const home1 = await get(storeHost(1), "/");
    expect(home0.status).toBe(200);
    expect(home0.type).toMatch(/text\/html/);
    expect(home0.body).not.toBe(home1.body);
    expect(
      (await get(storeHost(0), "/products/anything-at-all")).body,
    ).toContain('id="ProductJson"');
    expect((await get(storeHost(0), "/collections/x?page=2")).body).toContain(
      "FacetFiltersForm",
    );
    expect((await get(storeHost(0), "/cart")).body).toContain("Your cart");
    const css = await get(
      storeHost(0),
      "/cdn/shop/t/1/assets/base.css?v=1712345678",
    );
    expect(css.status).toBe(200);
    expect(css.type).toBe("text/css");
    expect((await get(storeHost(0), "/robots.txt")).body).toContain(
      "Disallow: /checkouts/",
    );
  });

  it("answers 404 for unknown stores and paths", async () => {
    expect((await get("other.example", "/")).status).toBe(404);
    expect((await get(storeHost(0), "/admin")).status).toBe(404);
    expect(
      (await get(storeHost(0), "/cdn/shop/t/1/assets/../manifest.json")).status,
    ).toBe(404);
  });

  it("reuses fixtures already on disk", () => {
    const before = fs.statSync(path.join(dir, "manifest.json")).mtimeMs;
    const m = writeFixtures(dir, 1, 1);
    expect(m.stores).toHaveLength(1);
    expect(fs.statSync(path.join(dir, "manifest.json")).mtimeMs).toBe(before);
  });
});
