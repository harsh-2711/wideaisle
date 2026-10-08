import { describe, expect, it } from "vitest";
import { detectStore, sampleLinks } from "../../../app/lib/scanner/detect";
import { PoliteClient, userAgentFor } from "../../../app/lib/scanner/polite";
import { parseRobots } from "../../../app/lib/scanner/robots";
import { parseDomains } from "../../../scripts/census/census";

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
    const client = new PoliteClient({ contact: "a@b.co", minDelayMs: 1000, fetchImpl, now: () => clock, sleep: async (ms) => void (clock += ms) });
    expect(await client.get("https://s.example/cart")).toBeNull();
    await client.get("https://s.example/");
    await client.get("https://s.example/products/x");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/robots.txt", "/", "/products/x"]);
    expect(calls.every((c) => c.ua.includes("contact: a@b.co"))).toBe(true);
    // Crawl-delay 3s beats the 1s minimum.
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(3000);
  });

  it("stays out when robots.txt errors, and allows all when it is missing", async () => {
    const make = (status: number) =>
      new PoliteClient({
        contact: "a@b.co",
        minDelayMs: 0,
        fetchImpl: (async (url: string) => new Response(url.endsWith("robots.txt") ? "x" : "<html></html>", { status: url.endsWith("robots.txt") ? status : 200 })) as unknown as typeof fetch,
      });
    expect(await make(503).get("https://s.example/")).toBeNull();
    expect(await make(404).get("https://s.example/")).not.toBeNull();
  });
});

describe("domain lists", () => {
  it("reads plain domains and Tranco CSV", () => {
    expect(parseDomains(["1,google.com", "example-store.com", "not a domain", "2,Shop.Example.CO"])).toEqual(["google.com", "example-store.com", "shop.example.co"]);
  });
});
