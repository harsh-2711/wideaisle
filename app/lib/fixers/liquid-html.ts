// A small scanner for HTML tags inside Liquid templates. It understands
// Liquid output and tags inside attributes, skips regions that are not markup
// (comments, raw, schema, scripts, styles), and never rewrites text it does
// not have to.

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

const SKIP_BLOCKS: [RegExp, RegExp][] = [
  [/\{%-?\s*comment\s*-?%\}/y, /\{%-?\s*endcomment\s*-?%\}/g],
  [/\{%-?\s*raw\s*-?%\}/y, /\{%-?\s*endraw\s*-?%\}/g],
  [/\{%-?\s*schema\s*-?%\}/y, /\{%-?\s*endschema\s*-?%\}/g],
  [/\{%-?\s*javascript\s*-?%\}/y, /\{%-?\s*endjavascript\s*-?%\}/g],
  [/\{%-?\s*stylesheet\s*-?%\}/y, /\{%-?\s*endstylesheet\s*-?%\}/g],
  [/\{%-?\s*style\s*-?%\}/y, /\{%-?\s*endstyle\s*-?%\}/g],
  [/<script\b/iy, /<\/script\s*>/gi],
  [/<style\b/iy, /<\/style\s*>/gi],
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
    for (const [open, close] of SKIP_BLOCKS) {
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
  for (const [open, close] of SKIP_BLOCKS.slice(6)) {
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

export function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`(^|[\\s"'}%])${name}(\\s*=|[\\s>/{]|$)`, "i").test(attrs);
}

export function attrValue(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|[\\s"'}%])${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
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

const ICON_RENDER = /\{%-?\s*(?:render|include)\s+['"]([^'"]*icon[^'"]*)['"][^%]*-?%\}/gi;
const ICON_ASSET = /\{\{-?\s*['"]([^'"]*icon[^'"]*\.svg)['"]\s*\|\s*inline_asset_content\s*-?\}\}/gi;

// Icon names used inside an element, for example ["icon-cart"].
export function iconNames(inner: string): string[] {
  const names = [...inner.matchAll(ICON_RENDER)].map((m) => m[1]);
  names.push(...[...inner.matchAll(ICON_ASSET)].map((m) => m[1].replace(/\.svg$/, "")));
  return names;
}

// True when the element's content gives it no accessible name: only icons,
// hidden elements, images with empty alt, Liquid logic and whitespace.
export function hasNoText(inner: string): boolean {
  let t = inner;
  t = t.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/gi, "");
  t = t.replace(ICON_RENDER, "").replace(ICON_ASSET, "");
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
