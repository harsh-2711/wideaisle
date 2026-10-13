// Speculation rules let a page make Chromium fetch other pages on its own
// (T-027). Those fetches skip Playwright's route handler, so they would skip
// robots.txt and the gap between page loads. The census removes the rules
// from every page it loads: the Speculation-Rules response header, and any
// <script type="speculationrules"> in the HTML.

// A script tag whose type is speculationrules, in any case or quoting.
const SCRIPT_TAG = /<script\b[^>]*>/gi;
const RULES_TYPE = /(\stype\s*=\s*)(["']?)\s*speculationrules\s*\2(?=[\s/>]|$)/i;
// An inert type: the element stays, so the page's DOM keeps its shape.
export const REMOVED_TYPE = "text/x-wide-aisle-removed-speculationrules";

// Returns the HTML with every speculation rules script made inert, or null
// when it has none. Works on bytes as latin1, which maps each byte to one
// character and back, so the page's own encoding is kept exactly.
export function withoutRulesScripts(body: Buffer): Buffer | null {
  const html = body.toString("latin1");
  if (!/speculationrules/i.test(html)) return null;
  let changed = false;
  const out = html.replace(SCRIPT_TAG, (tag) => {
    if (!RULES_TYPE.test(tag)) return tag;
    changed = true;
    return tag.replace(RULES_TYPE, `$1"${REMOVED_TYPE}"`);
  });
  return changed ? Buffer.from(out, "latin1") : null;
}

// Response headers without Speculation-Rules. With `bodyChanged`, also
// without the ones that describe the old body.
export function withoutRulesHeader(headers: Record<string, string>, bodyChanged: boolean): Record<string, string> {
  const drop = new Set(["speculation-rules", ...(bodyChanged ? ["content-length", "content-encoding", "transfer-encoding"] : [])]);
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !drop.has(k.toLowerCase())));
}

// An init script: it runs in every page and frame before the page's own
// scripts, and stops rules a page adds later, which the HTML filter cannot
// see. Measured on Chromium 141 (T-027): the type setter and setAttribute
// patches stop script-built rules; the observer also stops rules from
// document.write and createContextualFragment.
//
// It is source text, not a function: under tsx (npm run census), esbuild
// wraps inner functions in a __name helper the page does not have, and
// the script would throw.
export const BLOCK_SPECULATION_RULES = `(() => {
  const removed = ${JSON.stringify(REMOVED_TYPE)};
  const rules = /^\\s*speculationrules\\s*$/i;
  const type = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "type");
  if (type && type.set) {
    const setType = type.set;
    Object.defineProperty(HTMLScriptElement.prototype, "type", {
      ...type,
      set(v) { setType.call(this, rules.test(String(v)) ? removed : v); },
    });
  }
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const isRules = this instanceof HTMLScriptElement && String(name).toLowerCase() === "type" && rules.test(String(value));
    return setAttribute.call(this, name, isRules ? removed : value);
  };
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        for (const s of [n, ...n.querySelectorAll("script")]) {
          if (s instanceof HTMLScriptElement && rules.test(String(s.getAttribute("type")))) s.remove();
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
})();`;

export function isHtml(headers: Record<string, string>): boolean {
  const type = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  return type === "" || /html/i.test(type);
}
