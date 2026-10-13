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
import { startEgressProxy } from "../../app/lib/scanner/egress";
import { PoliteClient } from "../../app/lib/scanner/polite";
import { launchCensusBrowser, openScanContext } from "../../scripts/census/census";

const rules = (urls: string[]) => JSON.stringify({ prefetch: [{ source: "list", urls, eagerness: "immediate" }] });

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
document.write('<script type="specu' + 'lationrules">' + ${JSON.stringify(rules(["/secret/docwrite"]))} + '</scr' + 'ipt>');
</script></head>
<body><main><h1>Store</h1><a href="/secret/doc-a">A</a></main>
<script>
document.body.append(document.createRange().createContextualFragment('<script type="specu' + 'lationrules">' + ${JSON.stringify(rules(["/secret/fragment"]))} + '</scr' + 'ipt>'));
setTimeout(() => addRules(document.body, ["/secret/late"]), 300);
</script></body></html>`;

// What the unprotected control page fetches on both builds. A
// <link rel="prerender"> also fetched in the full binary before T-027; the
// census turns that off for the whole browser, so the control lacks it too.
const SEEN_BY_CONTROL = ["/secret/link-prefetch", "/secret/inline", "/secret/doc-a", "/secret/header", "/secret/script", "/secret/docwrite", "/secret/fragment", "/secret/late"];

test("a store page cannot make the census browser prefetch other store URLs", async () => {
  test.setTimeout(90_000);
  test.skip(typeof tls.setDefaultCACertificates !== "function", "needs Node 22.19 or later for tls.setDefaultCACertificates");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-census-prefetch-"));
  try {
    execFileSync("openssl", ["version"]);
  } catch {
    test.skip(true, "needs openssl to make a test certificate");
  }
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=shop.test", "-addext", "subjectAltName=DNS:*.shop.test", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = fs.readFileSync(path.join(dir, "cert.pem"), "utf8");
  const spki = crypto.createHash("sha256").update(crypto.createPublicKey(cert).export({ type: "spki", format: "der" })).digest("base64");
  const defaultCAs = tls.getCACertificates("default");
  tls.setDefaultCACertificates([...defaultCAs, cert]);

  const hits: string[] = [];
  const server = https.createServer({ cert, key: fs.readFileSync(path.join(dir, "key.pem")) }, (req, res) => {
    const host = String(req.headers.host).split(".")[0];
    const url = req.url ?? "/";
    hits.push(`${host} ${url}`);
    if (url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /secret\n");
    if (url === "/rules.json") return res.writeHead(200, { "content-type": "application/speculationrules+json" }).end(rules(["/secret/header"]));
    if (url === "/") return res.writeHead(200, { "content-type": "text/html", "speculation-rules": '"/rules.json"' }).end(PAGE);
    res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><html lang="en"><title>${url}</title></html>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const census = await launchCensusBrowser(process.env.PW_CHROMIUM_PATH, { extraArgs: [`--ignore-certificate-errors-spki-list=${spki}`] });
  const control = await startEgressProxy({ lookup: async () => ["127.0.0.1"], allowPrivate: true, ports: "any" });
  try {
    // Control: a plain context, with no census protections, shows the page
    // really makes this build fetch /secret on its own.
    const plain = await census.browser.newContext({ proxy: { server: control.server } });
    const page = await plain.newPage();
    await page.goto(`https://control.shop.test:${port}/`);
    await page.waitForTimeout(3000);
    await plain.close();
    const seen = hits.filter((h) => h.startsWith("control /secret")).map((h) => h.slice("control ".length));
    expect(seen).toEqual(expect.arrayContaining(SEEN_BY_CONTROL));

    // The census: robots.txt first, then the page, and nothing under /secret.
    const client = new PoliteClient({ contact: "census@example.com", minDelayMs: 0, allowPrivate: true, lookup: async () => ["127.0.0.1"] });
    const origin = `https://census.shop.test:${port}`;
    const ctx = await openScanContext(census.browser, client, `census.shop.test:${port}`);
    try {
      const scanPage = await ctx.context.newPage();
      expect(await client.pageTurn(origin + "/")).toBeNull();
      expect(await ctx.goto(scanPage, origin + "/")).toMatchObject({ url: origin + "/" });
      await scanPage.waitForTimeout(3000);
    } finally {
      // Over HTTPS this used to hang: the egress proxy waited on open tunnels.
      await ctx.close();
    }
    const fromCensus = hits.filter((h) => h.startsWith("census ")).map((h) => h.slice("census ".length));
    expect(fromCensus).toEqual(["/robots.txt", "/"]);
  } finally {
    await census.close();
    await control.close();
    server.close();
    tls.setDefaultCACertificates(defaultCAs);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
