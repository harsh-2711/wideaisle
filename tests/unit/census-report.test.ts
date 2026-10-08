import { describe, expect, it } from "vitest";
import { appFor, buildReport, CUSTOM_THEME, fixKind, OTHER, patternOf, pickRecords, renderReport, themeFamily, type ScanLine, type StoreLine } from "../../app/lib/census/report";

const six = (o: Partial<Record<string, number>> = {}) => ({
  "low-contrast": 0, "missing-alt": 0, "missing-label": 0, "empty-link": 0, "empty-button": 0, "missing-lang": 0, ...o,
}) as ScanLine["pages"][number]["sixTypes"];

const theme = (schemaName: string, version: string) => ({ name: schemaName, schemaName, version, themeStoreId: 887 });

const stores: StoreLine[] = [
  { domain: "a.com", isShopify: true, theme: theme("Dawn", "15.0.0"), apps: ["Klaviyo"] },
  { domain: "b.com", isShopify: true, theme: theme("Dawn", "12.0.0"), apps: [] },
  { domain: "c.com", isShopify: true, theme: theme("Sense", "15.1.0"), apps: [] },
  { domain: "d.com", isShopify: false, theme: null, apps: [] },
  { domain: "e.com", isShopify: true, theme: null, apps: [] },
];

const scans: ScanLine[] = [
  {
    domain: "a.com", theme: stores[0].theme, apps: ["Klaviyo"],
    pages: [{
      kind: "home", totalNodes: 10, sixTypes: six({ "low-contrast": 4, "empty-link": 2 }),
      rules: [
        { rule: "color-contrast", nodes: 4, bySource: { theme: 2, app: 2, unknown: 0 }, samples: [{ target: ".klaviyo-form p", html: '<p class="kl-text">Join</p>' }] },
        { rule: "link-name", nodes: 2, bySource: { theme: 2, app: 0, unknown: 0 }, samples: [{ target: ".header__icon", html: '<a class="header__icon header__icon--cart" href="/cart">' }] },
        { rule: "region", nodes: 4, bySource: { theme: 0, app: 0, unknown: 4 }, samples: [{ target: "div", html: "<div>" }] },
      ],
    }],
  },
  {
    domain: "b.com", theme: stores[1].theme, apps: [],
    pages: [{
      kind: "product", totalNodes: 3, sixTypes: six({ "missing-alt": 3 }),
      rules: [{ rule: "image-alt", nodes: 3, bySource: { theme: 3, app: 0, unknown: 0 }, samples: [{ target: ".product__media img", html: '<img src="//cdn.shopify.com/s/files/1/x.jpg">' }] }],
    }],
  },
  { domain: "c.com", theme: stores[2].theme, apps: [], pages: [], error: "timeout" },
];

describe("gap report", () => {
  it("groups themes and patterns", () => {
    expect(themeFamily(null)).toBe("Unknown");
    // Only Theme Store names are reported; a store's own name never is.
    expect(themeFamily({ name: "Acme Outdoor | acme.com live", schemaName: null, version: null, themeStoreId: null })).toBe(CUSTOM_THEME);
    expect(themeFamily({ name: "Copy of Dawn", schemaName: "Dawn", version: "15.0.0", themeStoreId: null })).toBe(CUSTOM_THEME);
    expect(themeFamily({ name: "x", schemaName: "  ", version: null, themeStoreId: 887 })).toBe(CUSTOM_THEME);
    // Only the element's own opening tag counts.
    expect(patternOf("link-name", '<a href="/"><span class="icon"></span></a>')).toBe("link-name: <a>");
    expect(patternOf("link-name", '<a data-class="x" href="/">')).toBe("link-name: <a>");
    expect(patternOf("link-name", '<a class="header__icon header__icon--cart" href="/cart">')).toBe('link-name: <a class="header__icon">');
    expect(patternOf("label", '<input id="Email-12345" class="field-123456 field">')).toBe('label: <input class="field">');
  });

  it("classifies the fix for each failure", () => {
    expect(fixKind("image-alt", "theme", '<img src="//cdn.shopify.com/s/files/1/x.jpg">')).toBe("content edit");
    expect(fixKind("color-contrast", "app", "<p>")).toBe("app change");
    expect(fixKind("link-name", "theme", "<a>")).toBe("theme patch");
    expect(fixKind("region", "theme", "<div>")).toBe("unclear");
    expect(fixKind("color-contrast", "unknown", "<p>")).toBe("source unclear");
  });

  it("builds the numbers the M2 exit needs", () => {
    const r = buildReport(stores, scans, { minStores: 1 });
    expect(r.storesChecked).toBe(5);
    expect(r.shopifyStores).toBe(4);
    expect(r.storesScanned).toBe(2);
    expect(r.themes[0]).toEqual({ label: "Dawn", count: 2, share: 0.5 });
    expect(r.themeVersions.Dawn.map((v) => v.label).sort()).toEqual(["12.x", "15.x"]);
    expect(r.sixTypePrevalence.find((p) => p.label === "Low-contrast text")?.share).toBe(0.5);
    expect(r.sixTypeShareOfAll).toBeCloseTo(9 / 13);
    expect(r.apps).toEqual([{ label: "Klaviyo", count: 2, share: 1 }]);
    expect(Object.fromEntries(r.fixKinds.map((k) => [k.label, k.count]))).toEqual({ "theme patch": 4, "app change": 2, "content edit": 3 });
    expect(r.v1Themes).toEqual(["Dawn", "Sense"]);
    expect(r.topFiveCoverage).toEqual({ stores: 3, share: 0.75 });
    // All six types are listed, even at zero.
    expect(r.sixTypePrevalence).toHaveLength(6);
    expect(r.sixTypePrevalence.find((p) => p.label === "Missing page language")?.count).toBe(0);
  });

  it("names no store: small themes and one-store patterns are folded away", () => {
    const many: StoreLine[] = Array.from({ length: 6 }, (_, i) => ({ domain: `s${i}.com`, isShopify: true, theme: theme("Dawn", "15.0.0"), apps: [] }));
    many.push({ domain: "acme.com", isShopify: true, theme: { name: "Acme Outdoor | acme.com live", schemaName: "Acme", version: "1.0.0", themeStoreId: 999 }, apps: [] });
    const hero = { rule: "color-contrast", nodes: 400, bySource: { theme: 400, app: 0, unknown: 0 }, samples: [{ target: ".acme-outdoor-hero", html: '<p class="acme-outdoor-hero">Sale</p>' }] };
    const scan: ScanLine = { domain: "acme.com", theme: null, apps: [], pages: [{ kind: "home", totalNodes: 400, sixTypes: six({ "low-contrast": 400 }), rules: [hero] }] };
    const r = buildReport(many, [scan]);
    expect(r.themes.map((t) => t.label)).toEqual(["Dawn", OTHER]);
    expect(r.patterns).toEqual([]);
    const md = renderReport(r, "2026-10-08");
    expect(md).not.toMatch(/acme/i);
  });

  it("ties app failures to the app whose markup is in the element", () => {
    expect(appFor(["Shop Pay Installments", "Judge.me"], [{ target: "#shopify-section-template--1__apps .jdgm-btn", html: "<a>" }])).toBe("Judge.me");
    expect(appFor(["Meta Pixel"], [{ target: ".product__meta", html: "<p>" }])).toBeNull();
  });

  it("keeps a partial scan over a later failed retry", () => {
    const recs = [{ domain: "a.com", pages: [1] }, { domain: "a.com", error: "timeout" }, { domain: "b.com", error: "x" }, { domain: "b.com", pages: [2] }];
    expect(pickRecords(recs as { domain: string; error?: string }[])).toEqual([{ domain: "a.com", pages: [1] }, { domain: "b.com", pages: [2] }]);
  });

  it("says so when there are no scans instead of printing zeros", () => {
    const md = renderReport(buildReport([], []), "2026-10-08");
    expect(md).toContain("No scans yet.");
    expect(md).not.toContain("make up 0.0%");
  });

  it("renders a readable report with no em dashes", () => {
    const md = renderReport(buildReport(stores, scans, { minStores: 1 }), "2026-10-08");
    expect(md).toContain("## Proposed v1 themes (D-08)");
    expect(md).toContain("| Dawn | 2 | 50.0% |");
    expect(md).not.toContain("\u2014");
  });
});
