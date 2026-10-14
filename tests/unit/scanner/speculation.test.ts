import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  BLOCK_SPECULATION_RULES,
  isHtml,
  NEUTRALIZE_RULES_JS,
  neutralizeRules,
  REMOVED_TYPE,
  withoutRulesHeader,
  withoutRulesScripts,
} from "../../../app/lib/scanner/speculation";

const strip = (html: string) => withoutRulesScripts(Buffer.from(html, "latin1"))?.toString("latin1") ?? null;

describe("speculation rules in a page", () => {
  it("makes every speculation rules script inert, in any quoting or case", () => {
    for (const tag of [
      `<script type="speculationrules">`,
      `<script type='speculationrules'>`,
      `<script type=speculationrules>`,
      `<SCRIPT TYPE="SpeculationRules">`,
      `<script nonce="abc" type = " speculationrules " data-x="1">`,
      `<script\ntype="speculationrules"\n>`,
    ]) {
      const out = strip(`<head>${tag}{"prefetch":[]}</script></head>`);
      expect(out, tag).not.toBeNull();
      expect(out, tag).toContain(REMOVED_TYPE);
      expect(out!.toLowerCase(), tag).not.toMatch(/type\s*=\s*["']?\s*speculationrules/);
      // The rule text stays; only the type changes.
      expect(out, tag).toContain(`{"prefetch":[]}</script>`);
    }
  });

  it("finds the type however the HTML spells it, including inside a declarative shadow root", () => {
    for (const html of [
      `<script data-x="a>b" type="speculationrules">{}</script>`,
      `<script type="speculation&#114;ules">{}</script>`,
      `<script type="&#x53;peculationRules">{}</script>`,
      `<script type="speculation&#114ules">{}</script>`,
      `<script type="&Tab;speculationrules&NewLine;">{}</script>`,
      `<script/type=speculationrules>{}</script>`,
      `<script a="x"type="speculationrules">{}</script>`,
      `<div><template shadowrootmode="closed"><script data-x="a>b" type="speculation&#114;ules">{}</script></template></div>`,
    ]) {
      const out = strip(html);
      expect(out, html).not.toBeNull();
      expect(out, html).toContain(`type="${REMOVED_TYPE}"`);
    }
  });

  it("reads type values in linear time on hostile pages", () => {
    // A long whitespace run inside one value used to take seconds per page
    // (35 s for 200 KB), blocking the census for every store.
    const html = `<!doctype html><html><head><script type="a${"\t".repeat(200_000)}b"></script></head><body>hi</body></html>`;
    const started = performance.now();
    expect(neutralizeRules(html)).toBeNull();
    expect(withoutRulesScripts(Buffer.from(html, "latin1"))).toBeNull();
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("leaves other scripts and pages alone", () => {
    expect(strip(`<script>const t = "a";</script>`)).toBeNull();
    expect(strip(`<script data-type="speculationrules">x</script>`)).toBeNull();
    expect(strip(`<script type="application/json">{"speculationrules":1}</script>`)).toBeNull();
    expect(strip(`<script type="speculationrulesx">x</script>`)).toBeNull();
  });

  it("keeps the page's bytes, whatever its encoding", () => {
    // Shift_JIS and windows-1252 bytes around a rules script survive.
    const bytes = Buffer.concat([Buffer.from([0x82, 0xa0, 0xe9, 0xff]), Buffer.from(`<script type="speculationrules">{}</script>`), Buffer.from([0x93, 0xfa])]);
    const out = withoutRulesScripts(bytes)!;
    expect([...out.subarray(0, 4)]).toEqual([0x82, 0xa0, 0xe9, 0xff]);
    expect([...out.subarray(out.length - 2)]).toEqual([0x93, 0xfa]);
  });

  it("drops the Speculation-Rules header, and the body headers when the body changed", () => {
    const headers = { "Speculation-Rules": '"/rules.json"', "content-type": "text/html", "content-length": "9", "content-encoding": "gzip" };
    expect(withoutRulesHeader(headers, false)).toEqual({ "content-type": "text/html", "content-length": "9", "content-encoding": "gzip" });
    expect(withoutRulesHeader(headers, true)).toEqual({ "content-type": "text/html" });
  });

  it("treats only HTML, or a page with no type, as HTML", () => {
    expect(isHtml({ "content-type": "text/html; charset=utf-8" })).toBe(true);
    expect(isHtml({ "Content-Type": "application/xhtml+xml" })).toBe(true);
    expect(isHtml({})).toBe(true);
    expect(isHtml({ "content-type": "application/json" })).toBe(false);
  });

  it("uses one copy of the filter for the HTML and for document.write", () => {
    // neutralizeRules is compiled from NEUTRALIZE_RULES_JS, and the init
    // script embeds the same text, so every spelling test above covers both.
    expect(BLOCK_SPECULATION_RULES).toContain(`const neutralize = ${NEUTRALIZE_RULES_JS};`);
    const pageSide = vm.runInNewContext(NEUTRALIZE_RULES_JS) as (html: string) => string;
    const html = `<script type="&#x53;peculation&#114;ules">{}</script>`;
    expect(pageSide(html)).toBe(neutralizeRules(html));
  });

  it("ships the init script as plain JavaScript that parses", () => {
    // Source text, so no compiler can add helpers the page lacks.
    expect(typeof BLOCK_SPECULATION_RULES).toBe("string");
    expect(BLOCK_SPECULATION_RULES).not.toContain("__name");
    // Compiled, not run: it needs a DOM.
    expect(() => new vm.Script(BLOCK_SPECULATION_RULES)).not.toThrow();
  });
});
