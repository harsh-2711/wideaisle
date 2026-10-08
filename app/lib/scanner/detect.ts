// Reads what a public Shopify storefront says about itself: whether it is
// Shopify, its theme name, version and Theme Store id, and the apps whose
// scripts it loads. Only public HTML; no logins, no admin.

export interface ThemeInfo {
  name: string | null;
  schemaName: string | null;
  version: string | null;
  themeStoreId: number | null;
  role: string | null;
}

export interface StoreFacts {
  isShopify: boolean;
  shopDomain: string | null;
  theme: ThemeInfo | null;
  apps: string[];
}

function jsonObjectAfter(html: string, marker: RegExp): Record<string, unknown> | null {
  const m = marker.exec(html);
  if (!m) return null;
  const start = html.indexOf("{", m.index + m[0].length - 1);
  if (start < 0) return null;
  let depth = 0;
  let inString: string | null = null;
  for (let i = start; i < html.length && i < start + 5000; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") inString = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Script hosts and paths of common Shopify apps, for failure attribution
// (T-021). Extend from census data.
const APP_HINTS: [string, RegExp][] = [
  ["Klaviyo", /static\.klaviyo\.com|klaviyo/i],
  ["Judge.me", /judge\.me|judgeme/i],
  ["Yotpo", /yotpo/i],
  ["Loox", /loox\.io/i],
  ["Privy", /privy\.com/i],
  ["Omnisend", /omnisend/i],
  ["Gorgias", /gorgias/i],
  ["Tidio", /tidio/i],
  ["Rebuy", /rebuyengine/i],
  ["ReCharge", /rechargecdn|rechargeapps/i],
  ["Afterpay", /afterpay/i],
  ["Klarna", /klarna/i],
  ["Shop Pay Installments", /shop-pay-installments|shopify-pay-installments/i],
  ["accessiBe", /acsbapp|accessibe/i],
  ["UserWay", /userway/i],
  ["Hotjar", /hotjar/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm/i],
  ["Meta Pixel", /connect\.facebook\.net/i],
  ["TikTok Pixel", /analytics\.tiktok\.com/i],
];

export function detectStore(html: string): StoreFacts {
  const isShopify =
    /cdn\.shopify\.com|\/cdn\/shop\/|Shopify\.theme\s*=|shopify-features|window\.Shopify\s*=|Shopify\.shop\s*=/.test(html);
  const shopDomain = /Shopify\.shop\s*=\s*["']([a-z0-9-]+\.myshopify\.com)["']/i.exec(html)?.[1] ?? null;
  const t = jsonObjectAfter(html, /Shopify\.theme\s*=\s*\{/);
  const theme: ThemeInfo | null = t
    ? {
        name: (t.name as string) ?? null,
        schemaName: (t.schema_name as string) ?? null,
        version: (t.schema_version as string) ?? null,
        themeStoreId: typeof t.theme_store_id === "number" ? t.theme_store_id : null,
        role: (t.role as string) ?? null,
      }
    : null;
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const haystack = scripts.join(" ") + " " + (html.match(/<link\b[^>]*>/gi) ?? []).join(" ");
  const apps = APP_HINTS.filter(([, re]) => re.test(haystack)).map(([name]) => name);
  return { isShopify, shopDomain, theme, apps };
}

// Links to a collection and a product on the same site, for page sampling.
export function sampleLinks(html: string, origin: string): { collection: string | null; product: string | null } {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const local = hrefs
    .map((h) => {
      try {
        return new URL(h, origin);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => u !== null && u.origin === origin);
  const collections = local.filter((u) => /^\/collections\/[^/]+\/?$/.test(u.pathname));
  // A real collection page is more typical than the catch-all "all".
  const collection = collections.find((u) => !/^\/collections\/all\/?$/.test(u.pathname)) ?? collections[0];
  const product = local.find((u) => /\/products\/[^/]+\/?$/.test(u.pathname));
  return { collection: collection ? collection.pathname : null, product: product ? product.pathname : null };
}
