// A store page cannot make the census browser fetch store URLs that
// robots.txt disallows, or fetch pages outside the gap between page loads
// (T-027). Run it with each Chromium build the census may use, through
// PW_CHROMIUM_PATH: the full chrome binary and the headless shell.
//
// Chromium prefetches only secure URLs, so the store is served over HTTPS
// with a throwaway certificate made here. Only that certificate is trusted:
// by Node through tls.setDefaultCACertificates, by Chromium through its SPKI
// hash. Nothing else loses certificate checks.
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { startEgressProxy, type EgressProxy } from "../../app/lib/scanner/egress";
import { PoliteClient } from "../../app/lib/scanner/polite";
import { launchCensusBrowser, openScanContext, PLAYWRIGHT_ENABLED_FEATURES, type CensusBrowser } from "../../scripts/census/census";

const rules = (urls: string[]) => JSON.stringify({ prefetch: [{ source: "list", urls, eagerness: "immediate" }] });
// A rules script built from split strings, so no HTML filter can see it.
const split = (urls: string[]) => `'<script type="specu' + 'lationrules">' + ${JSON.stringify(rules(urls))} + '</scr' + 'ipt>'`;

// One page with every way we found to make Chromium fetch another page on
// its own. Each points at its own /secret path, which robots.txt disallows.
const PAGE = `<!doctype html><html lang="en"><head><title>Store</title>
<link rel="prefetch" href="/secret/link-prefetch">
<link rel="prerender" href="/secret/link-prerender">
<script type="speculationrules">${JSON.stringify({
  prefetch: [
    { source: "list", urls: ["/secret/inline"], eagerness: "immediate" },
    { source: "document", where: { href_matches: "/secret/doc-*" }, eagerness: "immediate" },
  ],
})}</script>
<script>
const addRules = (where, urls) => {
  const s = document.createElement("script");
  s.type = "speculationrules";
  s.textContent = JSON.stringify({ prefetch: [{ source: "list", urls, eagerness: "immediate" }] });
  where.append(s);
};
addRules(document.head, ["/secret/script"]);
document.write(${split(["/secret/docwrite"])});
</script></head>
<body><main><h1>Store</h1><a href="/secret/doc-a">A</a>
<div id="open-host"></div><div id="closed-host"></div>
<div><template shadowrootmode="closed"><script data-x="a>b" type="speculation&#114;ules">${rules(["/secret/dsd-closed"])}</script></template></div>
</main>
<script>
document.body.append(document.createRange().createContextualFragment(${split(["/secret/fragment"])}));
{
  const s = document.createElement("script");
  s.setAttributeNS(null, "type", "speculationrules");
  s.textContent = ${JSON.stringify(rules(["/secret/shadow-open"]))};
  document.getElementById("open-host").attachShadow({ mode: "open" }).append(s);
}
document.getElementById("closed-host").attachShadow({ mode: "closed" }).append(document.createRange().createContextualFragment(${split(["/secret/shadow-closed"])}));
document.write('<div><template shadowrootmode="closed">' + ${split(["/secret/dsd-write"])} + '</template></div>');
document.write('<div><template shadowrootmode="closed"><script type="specu', 'lationrules">' + ${JSON.stringify(rules(["/secret/dsd-write-args"]))} + '</scr' + 'ipt></template></div>');
document.write('<div><template shadowrootmode="closed"><script type="specu');
document.write('lationrules">' + ${JSON.stringify(rules(["/secret/dsd-write-calls"]))} + '</scr' + 'ipt></template></div>');
// Arguments that are not strings, and writeln, still work as before.
document.write(1, " ", { toString() { return "<b id=odd>obj</b>"; } }, null);
document.writeln("<i id=wl>a</i>", "<i>b</i>");
setTimeout(() => addRules(document.body, ["/secret/late"]), 300);
</script></body></html>`;

// What the unprotected control page fetches on both builds.
const SEEN_BY_CONTROL = [
  "/secret/link-prefetch",
  "/secret/inline",
  "/secret/doc-a",
  "/secret/header",
  "/secret/script",
  "/secret/docwrite",
  "/secret/fragment",
  "/secret/shadow-open",
  "/secret/shadow-closed",
  "/secret/dsd-closed",
  "/secret/dsd-write",
  "/secret/dsd-write-args",
  "/secret/dsd-write-calls",
  "/secret/late",
];
// A known limit, stated in docs/census/README.md: a rule split across two
// separate document.write calls, inside a closed declarative shadow root.
// No single call's text shows the rule whole, and no script hook reaches
// the root. If the census stops fetching it, remove it here and from the
// README.
const KNOWN_LIMITS = ["/secret/dsd-write-calls"];
// <link rel="prerender"> fetches only in the full binary; the headless
// shell has no NoState prefetch.
const EXE = process.env.PW_CHROMIUM_PATH || undefined;
const FULL_BINARY = !!EXE && !/headless[_-]shell/.test(EXE);

test("a store page cannot make the census browser prefetch other store URLs", async () => {
  test.setTimeout(90_000);
  test.skip(typeof tls.setDefaultCACertificates !== "function", "needs Node 22.19 or later for tls.setDefaultCACertificates");
  const defaultCAs = tls.getCACertificates("default");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-census-prefetch-"));
  let server: https.Server | undefined;
  let census: CensusBrowser | undefined;
  let controlBrowser: CensusBrowser | undefined;
  let controlProxy: EgressProxy | undefined;
  try {
    try {
      execFileSync("openssl", ["version"]);
    } catch {
      test.skip(true, "needs openssl to make a test certificate");
    }
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=shop.test", "-addext", "subjectAltName=DNS:*.shop.test", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem")], { stdio: "ignore" });
    const cert = fs.readFileSync(path.join(dir, "cert.pem"), "utf8");
    const spki = crypto.createHash("sha256").update(crypto.createPublicKey(cert).export({ type: "spki", format: "der" })).digest("base64");
    tls.setDefaultCACertificates([...defaultCAs, cert]);

    const hits: string[] = [];
    const srv = https.createServer({ cert, key: fs.readFileSync(path.join(dir, "key.pem")) }, (req, res) => {
      const host = String(req.headers.host).split(".")[0];
      const url = req.url ?? "/";
      hits.push(`${host} ${url}`);
      if (url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /secret\n");
      if (url === "/rules.json") return res.writeHead(200, { "content-type": "application/speculationrules+json" }).end(rules(["/secret/header"]));
      if (url === "/") return res.writeHead(200, { "content-type": "text/html", "speculation-rules": '"/rules.json"' }).end(PAGE);
      res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html lang="en"><title>${url}</title></html>`);
    });
    server = srv;
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    const trustTestKey = `--ignore-certificate-errors-spki-list=${spki}`;

    // Control: a census browser whose last --enable-features drops the
    // census's own value (only the last switch counts), so it has no
    // NoState prefetch holdback, and a plain context with no census route
    // handler or init scripts. It shows the page really makes this build
    // fetch /secret on its own.
    controlBrowser = await launchCensusBrowser(EXE, { extraArgs: [trustTestKey, `--enable-features=${PLAYWRIGHT_ENABLED_FEATURES.join(",")}`] });
    controlProxy = await startEgressProxy({ lookup: async () => ["127.0.0.1"], allowPrivate: true, ports: "any" });
    const plain = await controlBrowser.browser.newContext({ proxy: { server: controlProxy.server } });
    const page = await plain.newPage();
    await page.goto(`https://control.shop.test:${port}/`);
    await page.waitForTimeout(3000);
    await plain.close();
    const seen = hits.filter((h) => h.startsWith("control /secret")).map((h) => h.slice("control ".length));
    expect(seen).toEqual(expect.arrayContaining(FULL_BINARY ? [...SEEN_BY_CONTROL, "/secret/link-prerender"] : SEEN_BY_CONTROL));

    // The census: robots.txt first, then the page, and nothing under /secret.
    census = await launchCensusBrowser(EXE, { extraArgs: [trustTestKey] });
    const client = new PoliteClient({ contact: "census@example.com", minDelayMs: 0, allowPrivate: true, lookup: async () => ["127.0.0.1"] });
    const origin = `https://census.shop.test:${port}`;
    const ctx = await openScanContext(census.browser, client, `census.shop.test:${port}`);
    const errors: string[] = [];
    try {
      const scanPage = await ctx.context.newPage();
      scanPage.on("pageerror", (e) => errors.push(e.message));
      expect(await client.pageTurn(origin + "/")).toBeNull();
      expect(await ctx.goto(scanPage, origin + "/")).toMatchObject({ url: origin + "/" });
      await scanPage.waitForTimeout(3000);
      expect(await scanPage.evaluate(() => [document.getElementById("odd")?.textContent, document.getElementById("wl")?.textContent])).toEqual(["obj", "a"]);
    } finally {
      // Over HTTPS this used to hang: the egress proxy waited on open tunnels.
      await ctx.close();
    }
    const fromCensus = hits.filter((h) => h.startsWith("census ")).map((h) => h.slice("census ".length));
    expect(fromCensus.filter((p) => !p.startsWith("/secret"))).toEqual(["/robots.txt", "/"]);
    expect(fromCensus.filter((p) => p.startsWith("/secret"))).toEqual(KNOWN_LIMITS);
    // The census's init scripts break nothing on the page.
    expect(errors).toEqual([]);
  } finally {
    await census?.close();
    await controlBrowser?.close();
    await controlProxy?.close();
    server?.close();
    tls.setDefaultCACertificates(defaultCAs);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
