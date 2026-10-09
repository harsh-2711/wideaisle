// A small scanner for HTML tags inside Liquid templates. It understands
// Liquid output and tags inside attributes, skips regions that are not markup
// (comments, doc, raw, schema, scripts, styles), and never rewrites text it
// does not have to.

export interface Tag {
  name: string;
  start: number; // index of "<"
  end: number; // index just after ">"
  attrs: string; // raw text between the name and ">"
}

export interface Element extends Tag {
  closeStart: number; // index of "</name"
  closeEnd: number; // index just after its ">"
  inner: string;
}

// Liquid blocks whose body is not markup: skipped whole.
const LIQUID_BLOCKS: [RegExp, RegExp][] = [
  [/\{%-?\s*comment\s*-?%\}/y, /\{%-?\s*endcomment\s*-?%\}/g],
  [/\{%-?\s*doc\s*-?%\}/y, /\{%-?\s*enddoc\s*-?%\}/g],
  [/\{%-?\s*raw\s*-?%\}/y, /\{%-?\s*endraw\s*-?%\}/g],
  [/\{%-?\s*schema\s*-?%\}/y, /\{%-?\s*endschema\s*-?%\}/g],
  [/\{%-?\s*javascript\s*-?%\}/y, /\{%-?\s*endjavascript\s*-?%\}/g],
  [/\{%-?\s*stylesheet\s*-?%\}/y, /\{%-?\s*endstylesheet\s*-?%\}/g],
  [/\{%-?\s*style\s*-?%\}/y, /\{%-?\s*endstyle\s*-?%\}/g],
];

// HTML regions that are not markup. The lookahead keeps custom elements
// such as <script-loader> or <style-x> out.
const HTML_BLOCKS: [RegExp, RegExp][] = [
  [/<script(?=[\s>/])/iy, /<\/script\s*>/gi],
  [/<style(?=[\s>/])/iy, /<\/style\s*>/gi],
  [/<!--/y, /-->/g],
];

// Index after a Liquid delimiter starting at i, or -1 if none starts there.
function skipLiquid(src: string, i: number): number {
  if (src[i] !== "{") return -1;
  const two = src.slice(i, i + 2);
  if (two === "{{") {
    const j = src.indexOf("}}", i + 2);
    return j < 0 ? src.length : j + 2;
  }
  if (two === "{%") {
    for (const [open, close] of LIQUID_BLOCKS) {
      open.lastIndex = i;
      if (open.test(src)) {
        close.lastIndex = i;
        const m = close.exec(src);
        return m ? m.index + m[0].length : src.length;
      }
    }
    const j = src.indexOf("%}", i + 2);
    return j < 0 ? src.length : j + 2;
  }
  return -1;
}

function skipHtmlBlock(src: string, i: number): number {
  if (src[i] !== "<") return -1;
  for (const [open, close] of HTML_BLOCKS) {
    open.lastIndex = i;
    if (open.test(src)) {
      close.lastIndex = i;
      const m = close.exec(src);
      return m ? m.index + m[0].length : src.length;
    }
  }
  return -1;
}

// Reads an opening tag at i. Handles quotes and Liquid inside attributes.
function readTag(src: string, i: number): Tag | null {
  const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(src.slice(i, i + 40));
  if (!m) return null;
  let j = i + m[0].length;
  let quote: string | null = null;
  while (j < src.length) {
    const lq = quote ? -1 : skipLiquid(src, j);
    if (lq >= 0) {
      j = lq;
      continue;
    }
    const c = src[j];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "{") {
        const k = skipLiquid(src, j);
        if (k >= 0) {
          j = k;
          continue;
        }
      }
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return { name: m[1].toLowerCase(), start: i, end: j + 1, attrs: src.slice(i + m[0].length, j) };
    j++;
  }
  return null;
}

// Every opening tag with one of the given names, in source order.
export function findTags(src: string, names: string[]): Tag[] {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const out: Tag[] = [];
  let i = 0;
  while (i < src.length) {
    const lq = skipLiquid(src, i);
    if (lq >= 0) {
      i = lq;
      continue;
    }
    const hb = skipHtmlBlock(src, i);
    if (hb >= 0) {
      i = hb;
      continue;
    }
    if (src[i] === "<") {
      const tag = readTag(src, i);
      if (tag) {
        if (wanted.has(tag.name)) out.push(tag);
        i = tag.end;
        continue;
      }
    }
    i++;
  }
  return out;
}

// The element an opening tag starts, with its matching close tag.
export function elementFor(src: string, tag: Tag): Element | null {
  let depth = 1;
  let i = tag.end;
  const closeRe = new RegExp(`^</${tag.name}\\s*>`, "i");
  while (i < src.length) {
    const lq = skipLiquid(src, i);
    if (lq >= 0) {
      i = lq;
      continue;
    }
    const hb = skipHtmlBlock(src, i);
    if (hb >= 0) {
      i = hb;
      continue;
    }
    if (src[i] === "<") {
      const close = closeRe.exec(src.slice(i, i + tag.name.length + 10));
      if (close) {
        if (--depth === 0) {
          return { ...tag, closeStart: i, closeEnd: i + close[0].length, inner: src.slice(tag.end, i) };
        }
        i += close[0].length;
        continue;
      }
      const t = readTag(src, i);
      if (t) {
        if (t.name === tag.name && !/\/\s*$/.test(t.attrs)) depth++;
        i = t.end;
        continue;
      }
    }
    i++;
  }
  return null;
}

export interface Attr {
  name: string; // lower case
  value: string | null; // null when the attribute has no "="
}

// Index just past the Liquid at i, or i + 1 when no Liquid starts there.
function stepOver(src: string, i: number): number {
  const k = src[i] === "{" ? skipLiquid(src, i) : -1;
  return k >= 0 ? k : i + 1;
}

const NAME_END = /[\s=>/"']/;

// The attributes of a tag, in source order, read with the same quote and
// Liquid rules as readTag. Liquid between attributes is skipped, so an
// attribute inside {% if %} counts as present.
export function parseAttrs(attrs: string): Attr[] {
  const out: Attr[] = [];
  const n = attrs.length;
  let i = 0;
  while (i < n) {
    if (/[\s/"']/.test(attrs[i])) {
      i++;
      continue;
    }
    // {% if %} and other tags sit between attributes.
    if (attrs.startsWith("{%", i)) {
      i = skipLiquid(attrs, i);
      continue;
    }
    // A name may hold Liquid output ("data-{{ x }}"); it is then one name
    // that matches no real attribute.
    let j = i;
    while (j < n && !NAME_END.test(attrs[j]) && !attrs.startsWith("{%", j)) j = attrs.startsWith("{{", j) ? skipLiquid(attrs, j) : j + 1;
    if (j === i) {
      i++;
      continue;
    }
    const name = attrs.slice(i, j).toLowerCase();
    const liquidOnly = /^(\{\{[\s\S]*?\}\})+$/.test(name);
    let k = j;
    while (k < n && /\s/.test(attrs[k])) k++;
    if (attrs[k] !== "=") {
      // Bare output such as {{ block.shopify_attributes }} is not a name.
      if (!liquidOnly) out.push({ name, value: null });
      i = j;
      continue;
    }
    k++;
    while (k < n && /\s/.test(attrs[k])) k++;
    const quote = attrs[k];
    if (quote === '"' || quote === "'") {
      let e = k + 1;
      while (e < n && attrs[e] !== quote) e = stepOver(attrs, e);
      out.push({ name, value: attrs.slice(k + 1, Math.min(e, n)) });
      i = e + 1;
    } else {
      let e = k;
      while (e < n && !/[\s>]/.test(attrs[e])) e = stepOver(attrs, e);
      out.push({ name, value: attrs.slice(k, Math.min(e, n)) });
      i = e;
    }
  }
  return out;
}

export function hasAttr(attrs: string, name: string): boolean {
  const want = name.toLowerCase();
  return parseAttrs(attrs).some((a) => a.name === want);
}

// The first value of the attribute, "" when it has no value, null when absent.
export function attrValue(attrs: string, name: string): string | null {
  const want = name.toLowerCase();
  const a = parseAttrs(attrs).find((x) => x.name === want);
  return a ? (a.value ?? "") : null;
}

// Inserts text right after the tag name, so it is never inside Liquid.
export function withAttr(tag: Tag, src: string, attrText: string): string {
  const at = tag.start + 1 + tag.name.length;
  return src.slice(0, at) + " " + attrText + src.slice(at);
}

// Applies insertions from the end of the file backwards, so earlier indexes
// stay valid.
export function insertAll(src: string, edits: { tag: Tag; attr: string }[]): string {
  let out = src;
  for (const e of [...edits].sort((a, b) => b.tag.start - a.tag.start)) out = withAttr(e.tag, out, e.attr);
  return out;
}

const RENDER = /\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"][^%]*-?%\}/gi;
const ICON_ASSET = /\{\{-?\s*['"]([^'"]*icon[^'"]*\.svg)['"]\s*\|\s*inline_asset_content\s*-?\}\}/gi;

// A snippet that draws only an icon: "icon-cart", "icon", "svg-icon",
// "cart-icon". Names that also draw text ("icon-with-text",
// "cart-icon-with-count") are not icons.
export function isIconSnippet(name: string): boolean {
  return /^(icons?|svg-icons?)([-_]|$)|[-_]icons?$/i.test(name) && !/text|label|count|title|with/i.test(name);
}

// Icon names used inside an element, for example ["icon-cart"].
export function iconNames(inner: string): string[] {
  const names = [...inner.matchAll(RENDER)].map((m) => m[1]).filter(isIconSnippet);
  names.push(...[...inner.matchAll(ICON_ASSET)].map((m) => m[1].replace(/\.svg$/, "")));
  return names;
}

// Liquid tags that can print text: a snippet, an echo or a section.
const PRINTS_TEXT = /\{%-?\s*(?:render|include|echo|liquid|sections?|content_for)\b/i;

// True when the element's content gives it no accessible name: only icons,
// hidden elements, images with empty alt, Liquid logic and whitespace.
export function hasNoText(inner: string): boolean {
  let t = inner;
  t = t.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/gi, "");
  t = t.replace(RENDER, (m, name: string) => (isIconSnippet(name) ? "" : m)).replace(ICON_ASSET, "");
  // Any other snippet, echo or section could print a name: assume it does.
  if (PRINTS_TEXT.test(t)) return false;
  t = t.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, "");
  // Elements hidden from assistive tech contribute no name.
  t = t.replace(/<(\w+)\b[^>]*aria-hidden\s*=\s*["']?true["']?[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  t = t.replace(/<img\b[^>]*\balt\s*=\s*(""|'')[^>]*>/gi, "");
  if (/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(t)) t = t.replace(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi, "");
  // An image with alt text, or Liquid output, could carry a name: assume it does.
  if (/<img\b[^>]*\balt\s*=/i.test(t)) return false;
  t = t.replace(/\{%[\s\S]*?%\}/g, "");
  if (/\{\{[\s\S]*?\}\}/.test(t)) return false;
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/&nbsp;|&#160;/g, " ");
  return t.trim() === "";
}

export function isNamed(attrs: string): boolean {
  return ["aria-label", "aria-labelledby", "title"].some((a) => hasAttr(attrs, a));
}
