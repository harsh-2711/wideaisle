import { describe, expect, it } from "vitest";
import { detectStore, sampleLinks } from "../../../app/lib/scanner/detect";
import { isPublicAddress, sameSite } from "../../../app/lib/scanner/netguard";
import { sourceOf } from "../../../app/lib/scanner/axe";
import { isSkip, PoliteClient, userAgentFor } from "../../../app/lib/scanner/polite";

const publicLookup = async () => ["93.184.216.34"];
import { parseRobots, ruleMatches } from "../../../app/lib/scanner/robots";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { done, latest, MAX_ATTEMPTS, parseDomains, readRecords } from "../../../scripts/census/census";

describe("robots.txt", () => {
  const txt = `
# Shopify's default, shortened
User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /checkouts/
Disallow: /*?*oseid=*
Allow: /cart.js
Crawl-delay: 5

User-agent: WideAisleCensus
Disallow: /collections/*sort_by*
`;

  it("uses the most specific group, the longest rule and wildcards", () => {
    const mine = parseRobots(txt, "WideAisleCensus/0.1 (x)");
    expect(mine.isAllowed("/cart")).toBe(true); // our group has no /cart rule
    expect(mine.isAllowed("/collections/all?sort_by=price")).toBe(false);
    const other = parseRobots(txt, "SomeBot/1.0");
    expect(other.isAllowed("/cart")).toBe(false);
    expect(other.isAllowed("/cart.js")).toBe(true);
    expect(other.isAllowed("/products/x?oseid=1")).toBe(false);
    expect(other.isAllowed("/products/x")).toBe(true);
    expect(other.crawlDelaySeconds).toBe(5);
  });

  it("allows everything with no rules and handles $", () => {
    expect(parseRobots("", "x").isAllowed("/anything")).toBe(true);
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow:", "x");
    expect(r.isAllowed("/a.pdf")).toBe(false);
    expect(r.isAllowed("/a.pdf?x=1")).toBe(true);
  });

  it("matches agents by product token, not by substring", () => {
    const ua = "WideAisleCensus/0.1 (contact: a@b.co)";
    // An empty User-agent value matches nobody.
    expect(parseRobots("User-agent: *\nDisallow: /\n\nUser-agent:\nAllow: /", ua).isAllowed("/")).toBe(false);
    // "ai" is not our token.
    expect(parseRobots("User-agent: ai\nAllow: /\n\nUser-agent: *\nDisallow: /", ua).isAllowed("/")).toBe(false);
    // A version after the token still names us.
    expect(parseRobots("User-agent: WideAisleCensus/0.1\nDisallow: /", ua).isAllowed("/")).toBe(false);
  });

  it("keeps a group together across Sitemap lines, and ends it at Crawl-delay", () => {
    const r = parseRobots("User-agent: other\nSitemap: https://s.example/sitemap.xml\nUser-agent: WideAisleCensus\nDisallow: /private", "WideAisleCensus/0.1");
    expect(r.isAllowed("/private/x")).toBe(false);
    // Another bot's lower Crawl-delay must not replace ours.
    const d = parseRobots("User-agent: *\nCrawl-delay: 10\nUser-agent: bingbot\nCrawl-delay: 5", "WideAisleCensus/0.1");
    expect(d.crawlDelaySeconds).toBe(10);
    const mine = parseRobots("User-agent: WideAisleCensus\nCrawl-delay: 20\nUser-agent: Pinterest\nCrawl-delay: 1", "WideAisleCensus/0.1");
    expect(mine.crawlDelaySeconds).toBe(20);
    const bad = parseRobots("User-agent: *\nCrawl-delay: 2\nUser-agent: BadBot\nDisallow: /", "WideAisleCensus/0.1");
    expect(bad.isAllowed("/")).toBe(true);
  });

  it("compares non-ASCII rules in percent-encoded form", () => {
    const r = parseRobots("User-agent: *\nDisallow: /café", "WideAisleCensus/0.1");
    expect(r.isAllowed(new URL("https://s.example/café").pathname)).toBe(false);
    expect(r.isAllowed("/cafe")).toBe(true);
  });

  it("matches wildcards without backtracking blow-up", () => {
    expect(ruleMatches("/a*b$", "/axxb")).toBe(true);
    expect(ruleMatches("/a*b$", "/axxbc")).toBe(false);
    expect(ruleMatches("/a*b", "/axxbc")).toBe(true);
    expect(ruleMatches("/*.pdf$", "/x/y.pdf")).toBe(true);
    expect(ruleMatches("*", "/")).toBe(true);
    const hostile = "/" + "*a".repeat(40) + "*b";
    const started = performance.now();
    expect(ruleMatches(hostile, "/products/" + "a".repeat(2000))).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("store detection", () => {
  const html = `<html><head>
<script>var Shopify = Shopify || {};
Shopify.shop = "example-store.myshopify.com";
Shopify.theme = {"name":"Dawn - live","id":123,"schema_name":"Dawn","schema_version":"15.0.0","theme_store_id":887,"role":"main"};
</script>
<script src="https://cdn.shopify.com/s/files/1/x.js"></script>
<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
</head><body>
<a href="/collections/all">All</a><a href="/collections/shirts">Shirts</a>
<a href="https://example.com/products/linen-shirt">Linen</a><a href="https://other.com/products/x">Other</a>
</body></html>`;

  it("reads the theme, shop and apps", () => {
    const facts = detectStore(html);
    expect(facts.isShopify).toBe(true);
    expect(facts.shopDomain).toBe("example-store.myshopify.com");
    expect(facts.theme).toEqual({ name: "Dawn - live", schemaName: "Dawn", version: "15.0.0", themeStoreId: 887, role: "main" });
    expect(facts.apps).toEqual(["Klaviyo"]);
  });

  it("reads tags in linear time on hostile pages", () => {
    const hostile = "<script ".repeat(50_000) + "<a href ".repeat(50_000) + "<link ".repeat(50_000);
    const started = performance.now();
    detectStore(hostile);
    sampleLinks(hostile, "https://example.com");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("keeps tag positions on pages with letters that grow when lower-cased", () => {
    const turkish = `<nav>${"<a href=\"/pages/iletisim\">\u0130LET\u0130\u015e\u0130M</a>".repeat(5)}</nav>` + "\u0130".repeat(40);
    const page = "\u0130".repeat(40) + turkish + html;
    expect(sampleLinks(page, "https://example.com")).toEqual({ collection: "/collections/shirts", product: "/products/linen-shirt" });
    expect(detectStore(page).apps).toEqual(["Klaviyo"]);
  });

  it("says no for a site that is not Shopify", () => {
    expect(detectStore("<html><body>Hello</body></html>")).toEqual({ isShopify: false, shopDomain: null, theme: null, apps: [] });
  });

  it("picks a collection and a product on the same site", () => {
    expect(sampleLinks(html, "https://example.com")).toEqual({ collection: "/collections/shirts", product: "/products/linen-shirt" });
  });
});

describe("polite client", () => {
  it("needs a contact for its user agent", () => {
    expect(() => userAgentFor("")).toThrow(/contact/);
    expect(userAgentFor("research@example.com")).toContain("contact: research@example.com");
  });

  it("reads robots.txt first, skips disallowed pages and spaces requests", async () => {
    let clock = 0;
    const calls: { url: string; at: number; ua: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, at: clock, ua: (init?.headers as Record<string, string>)["user-agent"] });
      const body = url.endsWith("/robots.txt") ? "User-agent: *\nDisallow: /cart\nCrawl-delay: 3" : "<html></html>";
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new PoliteClient({ contact: "a@b.co", minDelayMs: 1000, fetchImpl, now: () => clock, sleep: async (ms) => void (clock += ms), lookup: publicLookup });
    expect(await client.get("https://s.example/cart")).toMatchObject({ skipped: "disallowed", retry: false });
    await client.get("https://s.example/");
    await client.get("https://s.example/products/x");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/robots.txt", "/", "/products/x"]);
    expect(calls.every((c) => c.ua.includes("contact: a@b.co"))).toBe(true);
    // Crawl-delay 3s beats the 1s minimum, including for the first page.
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(3000);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(3000);
  });

  it("checks robots.txt and spaces every redirect hop", async () => {
    let clock = 0;
    const calls: { url: string; at: number }[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push({ url, at: clock });
      const u = new URL(url);
      if (u.pathname === "/robots.txt") return new Response(u.host === "other.example" ? "User-agent: *\nDisallow: /private" : "", { status: 200 });
      if (u.pathname === "/") return new Response("", { status: 301, headers: { location: "/a" } });
      if (u.pathname === "/a") return new Response("", { status: 301, headers: { location: "https://other.example/private" } });
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new PoliteClient({ contact: "a@b.co", minDelayMs: 2000, fetchImpl, now: () => clock, sleep: async (ms) => void (clock += ms), lookup: publicLookup });
    const res = await client.get("https://store.example/");
    expect(res).toMatchObject({ skipped: "disallowed", url: "https://other.example/private" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://store.example/robots.txt",
      "https://store.example/",
      "https://store.example/a",
      "https://other.example/robots.txt",
    ]);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(2000);
  });

  it("spaces concurrent page loads on one host", async () => {
    // A virtual clock: each sleep wakes at its own target time, in order,
    // so the check does not depend on how busy the test machine is.
    let clock = 0;
    const sleep = (ms: number) => {
      const target = clock + ms;
      return new Promise<void>((resolve) =>
        setImmediate(() => {
          clock = Math.max(clock, target);
          resolve();
        }),
      );
    };
    const at: number[] = [];
    const fetchImpl = (async (url: string) => {
      if (!url.endsWith("robots.txt")) at.push(clock);
      return new Response(url.endsWith("robots.txt") ? "" : "<html></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new PoliteClient({ contact: "a@b.co", minDelayMs: 2000, fetchImpl, now: () => clock, sleep, lookup: publicLookup });
    await Promise.all(["/a", "/b", "/c"].map((p) => client.get("https://s.example" + p)));
    at.sort((x, y) => x - y);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(2000);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(2000);
  });

  it("skips a store that asks for a very long crawl delay", async () => {
    const client = new PoliteClient({
      contact: "a@b.co",
      minDelayMs: 0,
      lookup: publicLookup,
      fetchImpl: (async () => new Response("User-agent: *\nCrawl-delay: 3600", { status: 200 })) as unknown as typeof fetch,
    });
    expect(await client.get("https://s.example/")).toMatchObject({ skipped: "crawl-delay-too-long" });
  });

  it("stays out when robots.txt errors, and allows all when it is missing", async () => {
    const make = (status: number) =>
      new PoliteClient({
        contact: "a@b.co",
        minDelayMs: 0,
        lookup: publicLookup,
        fetchImpl: (async (url: string) => new Response(url.endsWith("robots.txt") ? "x" : "<html></html>", { status: url.endsWith("robots.txt") ? status : 200 })) as unknown as typeof fetch,
      });
    expect(await make(503).get("https://s.example/")).toMatchObject({ skipped: "robots-unreachable", retry: true });
    expect(await make(429).get("https://s.example/")).toMatchObject({ skipped: "robots-unreachable", retry: true });
    expect(isSkip(await make(404).get("https://s.example/"))).toBe(false);
  });
});

describe("network guard", () => {
  it("knows public from private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["93.184.216.34", "23.227.38.65", "2606:4700::6810:84e5"]) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it("refuses hosts that resolve to private addresses, and redirects to them", async () => {
    const lookup = async (h: string) => (h === "evil.example" ? ["169.254.169.254"] : ["93.184.216.34"]);
    const fetchImpl = (async (url: string) =>
      url.endsWith("robots.txt")
        ? new Response("", { status: 404 })
        : new Response("", { status: 302, headers: { location: "http://evil.example/latest/meta-data" } })) as unknown as typeof fetch;
    const client = new PoliteClient({ contact: "a@b.co", minDelayMs: 0, fetchImpl, lookup });
    await expect(client.get("https://store.example/")).rejects.toThrow(/non-public/);
    await expect(new PoliteClient({ contact: "a@b.co", lookup }).get("http://evil.example/")).rejects.toThrow(/non-public/);
    await expect(client.get("http://127.0.0.1/")).rejects.toThrow(/non-public/);
  });

  it("treats www, subdomains and myshopify.com as the same store", () => {
    expect(sameSite("example.com", "www.example.com")).toBe(true);
    expect(sameSite("www.example.com", "example.com")).toBe(true);
    expect(sameSite("example.com", "shop.example.com")).toBe(true);
    expect(sameSite("example.com", "example.myshopify.com")).toBe(true);
    expect(sameSite("example.com", "evil.com")).toBe(false);
  });
});

describe("source guess", () => {
  it("does not read theme wrapper classes as apps", () => {
    expect(sourceOf("#shopify-section-template--21__main > .product__media-wrapper > img", "<img>")).toBe("theme");
    expect(sourceOf(".card-wrapper > a", "<a>")).toBe("unknown");
    expect(sourceOf("#shopify-section-template--21__apps > div", "<div>")).toBe("app");
    expect(sourceOf("#shopify-block-AbC__app_reviews_x > div", "<div>")).toBe("app");
    expect(sourceOf("div", '<div class="shopify-app-block">')).toBe("app");
  });
});

describe("domain lists", () => {
  it("reads plain domains and Tranco CSV", () => {
    expect(parseDomains(["1,google.com", "example-store.com", "not a domain", "2,Shop.Example.CO"])).toEqual(["google.com", "example-store.com", "shop.example.co"]);
  });
});

describe("resume", () => {
  it("retries retryable errors up to a limit and survives a cut-off line", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-resume-"));
    const file = path.join(dir, "out.jsonl");
    const lines = [
      { domain: "ok.example" },
      { domain: "disallowed.example", error: "robots.txt disallows /" },
      { domain: "flaky.example", error: "robots.txt unreachable", retry: true },
      ...Array.from({ length: MAX_ATTEMPTS }, () => ({ domain: "down.example", error: "timeout", retry: true })),
      { domain: "later.example", error: "timeout", retry: true },
      { domain: "later.example" },
    ];
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + '\n{"domain":"cut.exa');
    try {
      expect([...done(file)].sort()).toEqual(["disallowed.example", "down.example", "later.example", "ok.example"]);
      const records = readRecords<{ domain: string; retry?: boolean }>(file);
      expect(records).toHaveLength(lines.length);
      expect(latest(records).find((r) => r.domain === "later.example")?.retry).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
