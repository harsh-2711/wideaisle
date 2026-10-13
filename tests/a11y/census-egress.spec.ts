// The census browser reaches no host but the store and its asset hosts
// (T-026). Run it with each Chromium build the census may use, through
// PW_CHROMIUM_PATH: the full chrome binary and the headless shell.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { PoliteClient } from "../../app/lib/scanner/polite";
import {
  CENSUS_DISABLED_FEATURES,
  CENSUS_ENABLED_FEATURES,
  launchCensusBrowser,
  PLAYWRIGHT_DISABLED_FEATURES,
  PLAYWRIGHT_ENABLED_FEATURES,
  scan,
  type ScanRecord,
  type StoreRecord,
} from "../../scripts/census/census";

const EXE = process.env.PW_CHROMIUM_PATH || undefined;

// Browser processes this worker started: they have no --type= switch.
function browserArgs(): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const pid of fs.readdirSync("/proc").filter((p) => /^\d+$/.test(p))) {
    try {
      const ppid = Number(/^PPid:\s+(\d+)/m.exec(fs.readFileSync(`/proc/${pid}/status`, "utf8"))?.[1]);
      const args = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
      if (ppid === process.pid && args.includes("--remote-debugging-pipe") && !args.some((a) => a.startsWith("--type="))) out.set(Number(pid), args);
    } catch {
      // the process ended
    }
  }
  return out;
}

// The command line of the browser `launch` starts.
async function launchArgs(launch: () => Promise<() => Promise<void>>): Promise<string[]> {
  const before = browserArgs();
  const close = await launch();
  try {
    const started = [...browserArgs()].filter(([pid]) => !before.has(pid));
    expect(started).toHaveLength(1);
    return started[0][1];
  } finally {
    await close();
  }
}

// Each value of a --name= switch, as a feature list.
const lists = (args: string[], name: string) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3).split(","));

test("the census's feature switches keep Playwright's lists", async () => {
  test.skip(process.platform !== "linux", "reads /proc");
  // Chromium honours only the last --disable-features switch, and only the
  // last --enable-features switch (T-026, T-027). Playwright puts its own
  // first. If this fails after a Playwright upgrade, copy its new lists into
  // PLAYWRIGHT_DISABLED_FEATURES and PLAYWRIGHT_ENABLED_FEATURES.
  const plain = await launchArgs(async () => {
    const b = await chromium.launch({ executablePath: EXE });
    return () => b.close();
  });
  expect(lists(plain, "disable-features")).toEqual([PLAYWRIGHT_DISABLED_FEATURES]);
  expect(lists(plain, "enable-features")).toEqual(PLAYWRIGHT_ENABLED_FEATURES.length ? [PLAYWRIGHT_ENABLED_FEATURES] : []);

  const census = await launchArgs(async () => {
    const b = await launchCensusBrowser(EXE);
    return () => b.close();
  });
  expect(lists(census, "disable-features").at(-1)).toEqual([...PLAYWRIGHT_DISABLED_FEATURES, ...CENSUS_DISABLED_FEATURES]);
  expect(lists(census, "enable-features").at(-1)).toEqual([...PLAYWRIGHT_ENABLED_FEATURES, ...CENSUS_ENABLED_FEATURES]);
});

// A checkout-like form, which makes Chromium's autofill ask its server
// about the form unless that is turned off.
const PAGE = (port: number) => `<!doctype html><html lang="en"><head><title>Checkout</title>
<link rel="stylesheet" href="http://cdn.test:${port}/theme.css"></head><body><main>
<a href="/collections/all">All</a> <a href="/products/shirt">Shirt</a>
<form action="/order" method="post">
<label>Email <input type="email" name="email" autocomplete="email"></label>
<label>Name <input name="name" autocomplete="name"></label>
<label>Address <input name="address" autocomplete="street-address"></label>
<label>City <input name="city" autocomplete="address-level2"></label>
<label>Postcode <input name="zip" autocomplete="postal-code"></label>
<label>Phone <input type="tel" name="phone" autocomplete="tel"></label>
<button>Buy</button></form></main></body></html>`;

test("a census scan reaches no host but the store and its asset hosts", async () => {
  test.setTimeout(90_000);
  let port = 0;
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host).split(":")[0];
    if (host === "cdn.test") return res.writeHead(200, { "content-type": "text/css" }).end("main { margin: 0; }");
    if (req.url === "/robots.txt") return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html" }).end(PAGE(port));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-census-egress-"));
  // Every host the scan looks up is recorded. The store and its asset host
  // resolve here; anything else has no address and is refused.
  const looked = new Set<string>();
  const client = new PoliteClient({
    contact: "census@example.com",
    minDelayMs: 50,
    allowPrivate: true,
    lookup: async (host) => {
      looked.add(host);
      return host === "a.test" || host === "cdn.test" ? ["127.0.0.1"] : [];
    },
  });
  const census = await launchCensusBrowser(EXE);
  try {
    const store: StoreRecord = { domain: `a.test:${port}`, origin: `http://a.test:${port}`, checkedAt: "", isShopify: true, shopDomain: null, theme: null, apps: [] };
    const out = path.join(dir, "scans.jsonl");
    await scan([store], out, client, { browser: census.browser });
    const [record] = fs.readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l) as ScanRecord);
    expect(record.pages.map((p) => p.kind)).toEqual(["home", "collection", "product", "cart"]);
    expect([...looked].sort()).toEqual(["a.test", "cdn.test"]);
    expect(record.blockedHosts).toBeUndefined();

    // Traffic outside a store's context goes to the refusing proxy. Chromium
    // sends some at startup on its own (the full binary: a sign-in check and
    // a push-service check-in); a page in a plain context shows the route.
    const plain = await census.browser.newPage();
    await plain.goto("http://outside.test/").catch(() => {});
    await plain.close();
    expect(census.refused).toContain("outside.test");
    expect(looked.has("outside.test")).toBe(false);
    test.info().annotations.push({ type: "refused outside store contexts", description: [...census.refused].join(", ") });
  } finally {
    await census.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
