// The six v1 fixers (D-08). Each one is a pure function of a file's text,
// is idempotent, and only adds attributes or changes colour values, so a
// patch never removes merchant content.
import { adjustForContrast, contrast, parseHex, toHex } from "./color";
import { attrValue, elementFor, findTags, hasAttr, hasNoText, iconNames, insertAll, isNamed, type Tag } from "./liquid-html";
import { BUTTON_RULES, FIELD_RULES, LINK_RULES, inferName } from "./names";
import type { FixContext, Fixer, Patch } from "./types";

const LIQUID_FILE = /^(layout|sections|snippets|templates|blocks)\/.+\.liquid$/;

function patch(file: string, before: string, after: string, fixer: Fixer, notes: string[]): Patch | null {
  return after === before ? null : { file, before, after, type: fixer.type, fixer: fixer.id, notes };
}

function line(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

// ---------- missing page language ----------

export const missingLang: Fixer = {
  id: "missing-lang/html-lang",
  type: "missing-lang",
  fixFile(path, content) {
    if (!/^layout\/.+\.liquid$/.test(path)) return null;
    const html = findTags(content, ["html"]);
    const edits = html.filter((t) => !hasAttr(t.attrs, "lang")).map((tag) => ({ tag, attr: 'lang="{{ request.locale.iso_code }}"' }));
    if (!edits.length) return null;
    return patch(path, content, insertAll(content, edits), this, [`Set the page language from the store's locale on <html> (line ${line(content, edits[0].tag.start)}).`]);
  },
};

// ---------- empty links and empty buttons ----------

function clueText(tag: Tag, inner: string): string {
  return [tag.attrs, iconNames(inner).join(" ")].join(" ");
}

function nameFixer(id: string, type: "empty-link" | "empty-button", tagName: "a" | "button", rules: typeof LINK_RULES): Fixer {
  return {
    id,
    type,
    fixFile(path: string, content: string, ctx: FixContext) {
      if (!LIQUID_FILE.test(path)) return null;
      const edits: { tag: Tag; attr: string }[] = [];
      const notes: string[] = [];
      for (const tag of findTags(content, [tagName])) {
        if (isNamed(tag.attrs)) continue;
        // Hidden from assistive tech on purpose (decorative duplicate links).
        if (/aria-hidden\s*=\s*["']?true/i.test(tag.attrs)) continue;
        if (tagName === "a" && !hasAttr(tag.attrs, "href")) continue;
        const el = elementFor(content, tag);
        if (!el || !hasNoText(el.inner)) continue;
        const name = inferName(clueText(tag, el.inner), rules, ctx.locale);
        if (!name) {
          notes.push(`Needs review: <${tagName}> on line ${line(content, tag.start)} has no accessible name and no clue to name it.`);
          continue;
        }
        edits.push({ tag, attr: `aria-label="${name.value}"` });
        notes.push(`Named the ${name.role} ${tagName === "a" ? "link" : "button"} on line ${line(content, tag.start)} (${name.source}).`);
      }
      if (!edits.length) return notes.length ? { file: path, before: content, after: content, type, fixer: id, notes } : null;
      return { file: path, before: content, after: insertAll(content, edits), type, fixer: id, notes };
    },
  };
}

export const emptyLink = nameFixer("empty-link/aria-label", "empty-link", "a", LINK_RULES);
export const emptyButton = nameFixer("empty-button/aria-label", "empty-button", "button", BUTTON_RULES);

// ---------- missing form labels ----------

const UNLABELLED_TYPES = new Set(["", "text", "email", "search", "tel", "number", "password", "url"]);

function isWrappedInLabel(content: string, tag: Tag): boolean {
  const before = content.slice(0, tag.start);
  const open = before.lastIndexOf("<label");
  const close = before.lastIndexOf("</label");
  return open > close;
}

function hasLabelFor(content: string, id: string | null): boolean {
  if (!id) return false;
  return findTags(content, ["label"]).some((l) => attrValue(l.attrs, "for") === id);
}

export const missingLabel: Fixer = {
  id: "missing-label/aria-label",
  type: "missing-label",
  fixFile(path, content, ctx) {
    if (!LIQUID_FILE.test(path)) return null;
    const edits: { tag: Tag; attr: string }[] = [];
    const notes: string[] = [];
    for (const tag of findTags(content, ["input", "select", "textarea"])) {
      if (isNamed(tag.attrs)) continue;
      if (tag.name === "input" && !UNLABELLED_TYPES.has((attrValue(tag.attrs, "type") ?? "").toLowerCase())) continue;
      if (isWrappedInLabel(content, tag) || hasLabelFor(content, attrValue(tag.attrs, "id"))) continue;
      const placeholder = attrValue(tag.attrs, "placeholder");
      let value: string | null = null;
      let source = "";
      if (placeholder && placeholder.trim()) {
        value = placeholder;
        source = "its placeholder text";
      } else {
        const name = inferName(tag.attrs, FIELD_RULES, ctx.locale);
        if (name) {
          value = name.value;
          source = name.source;
        }
      }
      if (!value) {
        notes.push(`Needs review: <${tag.name}> on line ${line(content, tag.start)} has no label and no clue to name it.`);
        continue;
      }
      edits.push({ tag, attr: `aria-label="${value}"` });
      notes.push(`Labelled the <${tag.name}> on line ${line(content, tag.start)} from ${source}.`);
    }
    if (!edits.length) return notes.length ? { file: path, before: content, after: content, type: this.type, fixer: this.id, notes } : null;
    return { file: path, before: content, after: insertAll(content, edits), type: this.type, fixer: this.id, notes };
  },
};

// ---------- missing alt text ----------

export const missingAlt: Fixer = {
  id: "missing-alt/img-alt",
  type: "missing-alt",
  fixFile(path, content) {
    if (!LIQUID_FILE.test(path)) return null;
    const edits: { tag: Tag; attr: string }[] = [];
    const notes: string[] = [];
    for (const tag of findTags(content, ["img"])) {
      if (hasAttr(tag.attrs, "alt")) continue;
      if (/role\s*=\s*["']presentation["']/.test(tag.attrs) || /aria-hidden\s*=\s*["']true["']/.test(tag.attrs)) continue;
      const src = attrValue(tag.attrs, "src") ?? attrValue(tag.attrs, "srcset") ?? "";
      const object = /\{\{-?\s*([a-z_][\w.[\]'"]*?)\s*\|\s*(image_url|img_url|product_img_url|collection_img_url)/i.exec(src)?.[1];
      if (object && !/^['"]/.test(object)) {
        edits.push({ tag, attr: `alt="{{ ${object}.alt | escape }}"` });
        notes.push(`Added alt from ${object}.alt to the image on line ${line(content, tag.start)}. Images with no alt text in the admin also need alt text (Spike C).`);
      } else if (/logo/i.test(tag.attrs)) {
        edits.push({ tag, attr: 'alt="{{ shop.name | escape }}"' });
        notes.push(`Added the shop name as alt to the logo on line ${line(content, tag.start)}.`);
      } else {
        notes.push(`Needs review: <img> on line ${line(content, tag.start)} has no alt and its source does not say what it shows.`);
      }
    }
    if (!edits.length) return notes.length ? { file: path, before: content, after: content, type: this.type, fixer: this.id, notes } : null;
    return { file: path, before: content, after: insertAll(content, edits), type: this.type, fixer: this.id, notes };
  },
};

// ---------- low-contrast text (theme colour settings) ----------

// Foreground and background setting pairs that must reach 4.5:1.
// Dawn 10+ colour schemes, then the older Dawn and Online Store 2.0 keys.
const SCHEME_PAIRS: [string, string][] = [
  ["text", "background"],
  ["button_label", "button"],
  ["secondary_button_label", "background"],
];
const LEGACY_PAIRS: [string, string][] = [
  ["colors_text", "colors_background_1"],
  ["colors_text", "colors_background_2"],
  ["colors_solid_button_labels", "colors_accent_1"],
  ["colors_outline_button_labels", "colors_background_1"],
];

function stripComments(json: string): { head: string; body: string } {
  const m = /^\s*\/\*[\s\S]*?\*\/\s*/.exec(json);
  return m ? { head: m[0], body: json.slice(m[0].length) } : { head: "", body: json };
}

// Replaces the value of "key": "#xxxxxx" within [from, to) of text.
function replaceColor(text: string, from: number, to: number, key: string, oldHex: string, newHex: string): string {
  const region = text.slice(from, to);
  const re = new RegExp(`("${key}"\\s*:\\s*")${oldHex.replace("#", "#?")}(")`, "i");
  const updated = region.replace(re, `$1${newHex}$2`);
  return text.slice(0, from) + updated + text.slice(to);
}

function objectRange(text: string, key: string, start = 0): [number, number] | null {
  const k = text.indexOf(`"${key}"`, start);
  if (k < 0) return null;
  const open = text.indexOf("{", k);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return [open, i + 1];
  }
  return null;
}

function fixPairs(settings: Record<string, unknown>, pairs: [string, string][], label: string, notes: string[]): Record<string, string> {
  const changes: Record<string, string> = {};
  for (const [fgKey, bgKey] of pairs) {
    const fgHex = (changes[fgKey] ?? settings[fgKey]) as string | undefined;
    const bgHex = settings[bgKey] as string | undefined;
    const fg = fgHex ? parseHex(fgHex) : null;
    const bg = bgHex ? parseHex(bgHex) : null;
    if (!fg || !bg) continue;
    const before = contrast(fg, bg);
    if (before >= 4.5) continue;
    const fixed = adjustForContrast(fg, bg, 4.5);
    const hex = toHex(fixed);
    changes[fgKey] = hex;
    notes.push(`${label}: ${fgKey} ${fgHex} on ${bgKey} ${bgHex} was ${before.toFixed(2)}:1; now ${hex} at ${contrast(fixed, bg).toFixed(2)}:1, same hue.`);
  }
  return changes;
}

export const lowContrast: Fixer = {
  id: "low-contrast/color-settings",
  type: "low-contrast",
  fixFile(path, content) {
    if (path !== "config/settings_data.json") return null;
    const { head, body } = stripComments(content);
    let data: { current?: unknown; presets?: Record<string, Record<string, unknown>> };
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }
    // "current" is either the live settings object or the name of a preset.
    const currentKey = typeof data.current === "string" ? null : "current";
    const live = (currentKey ? data.current : data.presets?.[data.current as string]) as Record<string, unknown> | undefined;
    if (!live) return null;
    const scope = currentKey ? objectRange(body, "current") : objectRange(body, data.current as string, body.indexOf('"presets"'));
    if (!scope) return null;

    const notes: string[] = [];
    let text = body;
    const schemes = live.color_schemes as Record<string, { settings: Record<string, unknown> }> | undefined;
    if (schemes) {
      for (const [name, scheme] of Object.entries(schemes)) {
        const changes = fixPairs(scheme.settings ?? {}, SCHEME_PAIRS, `Colour scheme ${name}`, notes);
        for (const [key, hex] of Object.entries(changes)) {
          const range = objectRange(text, name, scope[0]);
          if (range) text = replaceColor(text, range[0], range[1], key, String(scheme.settings[key]), hex);
        }
      }
    }
    const legacy = fixPairs(live, LEGACY_PAIRS, "Theme colours", notes);
    for (const [key, hex] of Object.entries(legacy)) {
      const range = currentKey ? objectRange(text, "current") : objectRange(text, data.current as string, text.indexOf('"presets"'));
      if (range) text = replaceColor(text, range[0], range[1], key, String(live[key]), hex);
    }
    return patch(path, content, head + text, this, notes);
  },
};

export const ALL_FIXERS: Fixer[] = [lowContrast, missingAlt, missingLabel, emptyLink, emptyButton, missingLang];
