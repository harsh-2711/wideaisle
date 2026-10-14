// Speculation rules let a page make Chromium fetch other pages on its own
// (T-027). Those fetches skip Playwright's route handler, so they would skip
// robots.txt and the gap between page loads. The census removes the rules
// from every page it loads: the Speculation-Rules response header, any
// script whose type is speculationrules in the HTML, and any a page adds
// later (BLOCK_SPECULATION_RULES).

import vm from "node:vm";

// An inert type: the element stays, so the page's DOM keeps its shape.
export const REMOVED_TYPE = "text/x-wide-aisle-removed-speculationrules";

// The filter, as JavaScript source text: (html) => html, with every
// speculationrules type made inert. There is one copy. The page runs it
// inside the init script (document.write); Node compiles the same text
// once, below, for response bodies.
//
// It finds a type attribute and its value anywhere in the HTML. The HTML
// tokenizer starts an attribute after whitespace, a slash or a closing
// quote. Not tied to tag boundaries, so a ">" inside another attribute's
// value, or a <template shadowrootmode> around the script, changes nothing.
// A match outside a tag only makes some text inert, which is harmless.
//
// It reads the value as the browser does: unquoted, numeric character
// references and the two whitespace names decoded, whitespace trimmed,
// lower case. Only ASCII matters for "speculationrules". trim(), not a
// regex: a regex with an end anchor retries from every character of a
// whitespace run, which is quadratic. trim() also drops non-ASCII spaces,
// so it may make a few more values inert; harmless.
export const NEUTRALIZE_RULES_JS = String.raw`((html) => {
  const typeAttr = /(?<=[\s/"'])(type\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi;
  const ascii = (code) => (code < 128 ? String.fromCharCode(code) : "\ufffd");
  return html.replace(typeAttr, (whole, name, value) => {
    const v = (/^["']/.test(value) ? value.slice(1, -1) : value)
      .replace(/&#x([0-9a-f]+);?/gi, (m, hex) => ascii(parseInt(hex, 16)))
      .replace(/&#([0-9]+);?/g, (m, dec) => ascii(Number(dec)))
      .replace(/&Tab;/g, "\t")
      .replace(/&NewLine;/g, "\n")
      .trim()
      .toLowerCase();
    return v === "speculationrules" ? name + ${JSON.stringify(`"${REMOVED_TYPE}"`)} : whole;
  });
})`;

// Compiled once from our own constant above, not from page input.
const neutralize = vm.runInNewContext(NEUTRALIZE_RULES_JS) as (html: string) => string;

// The HTML with every speculationrules type made inert, or null if none.
export function neutralizeRules(html: string): string | null {
  const out = neutralize(html);
  return out === html ? null : out;
}

// For a response body. Works on bytes as latin1, which maps each byte to
// one character and back, so the page's own encoding is kept exactly.
export function withoutRulesScripts(body: Buffer): Buffer | null {
  const out = neutralizeRules(body.toString("latin1"));
  return out === null ? null : Buffer.from(out, "latin1");
}

// Response headers without Speculation-Rules. With `bodyChanged`, also
// without the ones that describe the old body.
export function withoutRulesHeader(headers: Record<string, string>, bodyChanged: boolean): Record<string, string> {
  const drop = new Set(["speculation-rules", ...(bodyChanged ? ["content-length", "content-encoding", "transfer-encoding"] : [])]);
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !drop.has(k.toLowerCase())));
}

// An init script: it runs in every page and frame before the page's own
// scripts, and stops rules a page adds later, which the HTML filter cannot
// see. Measured on Chromium 141 (T-027):
// - the type setter and setAttribute(NS) patches stop script-built rules;
// - the observer stops rules from document.write and fragments, in the
//   document and in every shadow root it can reach: ones made by
//   attachShadow (open or closed) and open declarative ones;
// - document.write and writeln get the same filter as the HTML, applied to
//   all of one call's string arguments joined. That covers a closed
//   declarative shadow root written by one call.
// Not covered, both in a closed declarative shadow root: one in the page
// source that the HTML filter misreads, and a rule split across two
// separate write calls, which no single call's text shows whole.
//
// It is source text, not a function: under tsx (npm run census), esbuild
// wraps inner functions in a __name helper the page does not have, and
// the script would throw.
export const BLOCK_SPECULATION_RULES = `(() => {
  const removed = ${JSON.stringify(REMOVED_TYPE)};
  const rules = /^\\s*speculationrules\\s*$/i;
  const neutralize = ${NEUTRALIZE_RULES_JS};
  const type = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "type");
  if (type && type.set) {
    const setType = type.set;
    Object.defineProperty(HTMLScriptElement.prototype, "type", {
      ...type,
      set(v) { setType.call(this, rules.test(String(v)) ? removed : v); },
    });
  }
  const isTypeOfScript = (el, name) => el instanceof HTMLScriptElement && String(name).toLowerCase() === "type";
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    return setAttribute.call(this, name, isTypeOfScript(this, name) && rules.test(String(value)) ? removed : value);
  };
  const setAttributeNS = Element.prototype.setAttributeNS;
  Element.prototype.setAttributeNS = function (ns, name, value) {
    return setAttributeNS.call(this, ns, name, ns == null && isTypeOfScript(this, name) && rules.test(String(value)) ? removed : value);
  };
  const opts = { childList: true, subtree: true };
  const watched = new WeakSet();
  const isRules = (el) => el instanceof HTMLScriptElement && rules.test(String(el.getAttribute("type")));
  const sweep = (node) => {
    for (const el of [node, ...node.querySelectorAll("*")]) {
      if (isRules(el)) el.remove();
      else if (el.shadowRoot) watch(el.shadowRoot);
    }
  };
  const mo = new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n instanceof Element) sweep(n);
  });
  const watch = (root) => {
    if (watched.has(root)) return;
    watched.add(root);
    mo.observe(root, opts);
    sweep(root);
  };
  mo.observe(document, opts);
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    watch(root);
    return root;
  };
  for (const name of ["write", "writeln"]) {
    const write = Document.prototype[name];
    Document.prototype[name] = function (...parts) {
      // write() joins its arguments, so a rule split across two of them is
      // whole only once joined. Other values, such as TrustedHTML, pass
      // through as they are.
      if (parts.length > 0 && parts.every((p) => typeof p === "string")) return write.call(this, neutralize(parts.join("")));
      return write.apply(this, parts.map((p) => (typeof p === "string" ? neutralize(p) : p)));
    };
  }
})();`;

export function isHtml(headers: Record<string, string>): boolean {
  const type = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  return type === "" || /html/i.test(type);
}
