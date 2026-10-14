// Speculation rules let a page make Chromium fetch other pages on its own
// (T-027). Those fetches skip Playwright's route handler, so they would skip
// robots.txt and the gap between page loads. The census removes the rules
// from every page it loads: the Speculation-Rules response header, any
// script whose type is speculationrules in the HTML, and any a page adds
// later (BLOCK_SPECULATION_RULES).

// An inert type: the element stays, so the page's DOM keeps its shape.
export const REMOVED_TYPE = "text/x-wide-aisle-removed-speculationrules";

// A type attribute and its value, anywhere in the HTML. The HTML tokenizer
// starts an attribute after whitespace, a slash or a closing quote. Not tied
// to tag boundaries, so a ">" inside another attribute's value, or a
// <template shadowrootmode> around the script, changes nothing. A match
// outside a tag only makes some text inert, which is harmless.
const TYPE_ATTR_SOURCE = String.raw`(?<=[\s/"'])(type\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)`;
const TYPE_ATTR = new RegExp(TYPE_ATTR_SOURCE, "gi");

// An attribute value as the browser reads it: unquoted, numeric character
// references and the two whitespace names decoded, ASCII whitespace trimmed,
// lower case. Only ASCII matters for "speculationrules".
export function attrValue(raw: string): string {
  const ascii = (code: number) => (code < 128 ? String.fromCharCode(code) : "�");
  return (/^["']/.test(raw) ? raw.slice(1, -1) : raw)
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => ascii(parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/g, (_m, dec: string) => ascii(Number(dec)))
    .replace(/&Tab;/g, "\t")
    .replace(/&NewLine;/g, "\n")
    // trim(), not a regex: a regex with an end anchor retries from every
    // character of a whitespace run, which is quadratic. trim() also drops
    // non-ASCII spaces, so it may make a few more values inert; harmless.
    .trim()
    .toLowerCase();
}

// The HTML with every speculationrules type made inert, or null if none.
export function neutralizeRules(html: string): string | null {
  let changed = false;
  const out = html.replace(TYPE_ATTR, (whole, name: string, value: string) => {
    if (attrValue(value) !== "speculationrules") return whole;
    changed = true;
    return `${name}"${REMOVED_TYPE}"`;
  });
  return changed ? out : null;
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

// neutralizeRules for the page, as source text: (html) => html. A unit
// test checks it agrees with neutralizeRules.
export const NEUTRALIZE_RULES_JS = `((html) => {
  const typeAttr = new RegExp(${JSON.stringify(TYPE_ATTR_SOURCE)}, "gi");
  const ascii = (code) => (code < 128 ? String.fromCharCode(code) : "\\ufffd");
  return html.replace(typeAttr, (whole, name, value) => {
    const v = (/^["']/.test(value) ? value.slice(1, -1) : value)
      .replace(/&#x([0-9a-f]+);?/gi, (m, hex) => ascii(parseInt(hex, 16)))
      .replace(/&#([0-9]+);?/g, (m, dec) => ascii(Number(dec)))
      .replace(/&Tab;/g, "\\t")
      .replace(/&NewLine;/g, "\\n")
      .trim()
      .toLowerCase();
    return v === "speculationrules" ? name + ${JSON.stringify(`"${REMOVED_TYPE}"`)} : whole;
  });
})`;

// An init script: it runs in every page and frame before the page's own
// scripts, and stops rules a page adds later, which the HTML filter cannot
// see. Measured on Chromium 141 (T-027):
// - the type setter and setAttribute(NS) patches stop script-built rules;
// - the observer stops rules from document.write and fragments, in the
//   document and in every shadow root it can reach: ones made by
//   attachShadow (open or closed) and open declarative ones;
// - document.write and writeln get the same filter as the HTML, which
//   covers closed declarative shadow roots written by a script.
// A closed declarative shadow root in the page source is reachable only by
// the HTML filter.
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
      return write.apply(this, parts.map((p) => (typeof p === "string" ? neutralize(p) : p)));
    };
  }
})();`;

export function isHtml(headers: Record<string, string>): boolean {
  const type = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  return type === "" || /html/i.test(type);
}
