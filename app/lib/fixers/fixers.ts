// The six v1 fixers (D-08). Each one is a pure function of a file's text,
// is idempotent, and only adds attributes or changes colour values, so a
// patch never removes merchant content.
import { blend, contrast, contrastAt, parseHex, solveColor, toHex, type RGB } from "./color";
import { setString } from "./json-text";
import { attrValue, elementFor, findTags, hasAttr, hasNoText, iconNames, insertAll, isNamed, type Element, type Tag } from "./liquid-html";
import { BUTTON_RULES, FIELD_RULES, LINK_RULES, SHOP_LOGO, inferName } from "./names";
import type { FixContext, Fixer, Patch } from "./types";

const LIQUID_FILE = /^(layout|sections|snippets|templates|blocks)\/.+\.liquid$/;

function patch(file: string, before: string, after: string, fixer: Fixer, notes: string[]): Patch | null {
  return after === before ? null : { file, before, after, type: fixer.type, fixer: fixer.id, notes };
}

// Makes a value safe inside a double-quoted HTML attribute. Text outside
// Liquid is HTML-escaped (entities stay as they are); inside Liquid, double
// quotes become single quotes, which Liquid treats the same.
export function attrSafe(value: string): string {
  return value
    .split(/(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/)
    .map((part, i) => (i % 2 === 1 ? part.replace(/"/g, "'") : part.replace(/&(?!#?\w+;)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")))
    .join("");
}

const BLOCK_TAG = /^(if|unless|case|for|capture|tablerow|comment|raw)$/;

// True when every {{ }} and {% %} in the value closes, and every Liquid
// block (if, for, case...) ends inside the value. Only such values can be
// copied into a new attribute without breaking the template.
export function liquidBalanced(value: string): boolean {
  const open: string[] = [];
  let i = 0;
  while (i < value.length) {
    const two = value.slice(i, i + 2);
    if (two === "{{" || two === "{%") {
      const close = two === "{{" ? "}}" : "%}";
      const j = value.indexOf(close, i + 2);
      if (j < 0) return false;
      const body = value.slice(i + 2, j);
      if (/\{\{|\{%/.test(body)) return false;
      if (two === "{%") {
        const word = /^-?\s*(\w+)/.exec(body)?.[1] ?? "";
        if (BLOCK_TAG.test(word)) open.push(word);
        else if (/^end\w+$/.test(word) && open.pop() !== word.slice(3)) return false;
      }
      i = j + 2;
      continue;
    }
    if (two === "}}" || two === "%}") return false;
    i++;
  }
  return open.length === 0;
}

// A value attrSafe can carry into a new attribute unchanged in meaning.
// attrSafe turns " into ' inside Liquid, so a Liquid part that already
// holds both kinds of quote ('Your "best" email', "it's") would break.
function copyable(value: string): boolean {
  if (!liquidBalanced(value)) return false;
  const liquidParts = value.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g) ?? [];
  return !liquidParts.some((part) => part.includes('"') && part.includes("'"));
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
  // The shop's logo inside a link is a clue that the link goes home.
  const logo = /settings\.logo\b/.test(inner) ? "settings.logo" : "";
  return [tag.attrs, iconNames(inner).join(" "), logo].join(" ");
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
        if (attrValue(tag.attrs, "aria-hidden")?.trim().toLowerCase() === "true") continue;
        if (tagName === "a" && !hasAttr(tag.attrs, "href")) continue;
        const el = elementFor(content, tag);
        if (!el) {
          // For example an opening tag split across {% if %} and {% else %}.
          notes.push(`Needs review: <${tagName}> on line ${line(content, tag.start)} has no matching closing tag here, so its content was not checked.`);
          continue;
        }
        if (!hasNoText(el.inner)) continue;
        const name = inferName(clueText(tag, el.inner), rules, ctx.locale);
        if (!name) {
          notes.push(`Needs review: <${tagName}> on line ${line(content, tag.start)} has no accessible name and no clue to name it.`);
          continue;
        }
        edits.push({ tag, attr: `aria-label="${attrSafe(name.value)}"` });
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
        if (!copyable(placeholder)) {
          notes.push(`Needs review: <${tag.name}> on line ${line(content, tag.start)} has no label, and its placeholder holds Liquid that cannot be copied safely.`);
          continue;
        }
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
      edits.push({ tag, attr: `aria-label="${attrSafe(value)}"` });
      notes.push(`Labelled the <${tag.name}> on line ${line(content, tag.start)} from ${source}.`);
    }
    if (!edits.length) return notes.length ? { file: path, before: content, after: content, type: this.type, fixer: this.id, notes } : null;
    return { file: path, before: content, after: insertAll(content, edits), type: this.type, fixer: this.id, notes };
  },
};

// ---------- missing alt text ----------

// Image objects whose .alt is the admin alt text. Other objects (product,
// collection, article) have no .alt, so alt="{{ product.alt }}" renders empty.
const IMAGE_OBJECT = /(?:^|\.)(?:image|featured_image|featured_media|media|preview_image)$/;

// The innermost <a> around position `at`, if any.
function enclosingLink(links: Element[], at: number): Element | undefined {
  return links.filter((a) => a.end <= at && at < a.closeStart).sort((x, y) => y.start - x.start)[0];
}

// True when the link shows text besides this image, always. Text inside
// {% if %} or {% case %} may render without the image, so it does not count.
function linkHasOtherText(content: string, link: Element, img: Tag): boolean {
  const rest = content.slice(link.end, img.start) + content.slice(img.end, link.closeStart);
  if (/\{%-?\s*(?:if|unless|case|else|elsif|when)\b/.test(rest)) return false;
  return !hasNoText(rest);
}

export const missingAlt: Fixer = {
  id: "missing-alt/img-alt",
  type: "missing-alt",
  fixFile(path, content) {
    if (!LIQUID_FILE.test(path)) return null;
    const edits: { tag: Tag; attr: string }[] = [];
    const notes: string[] = [];
    const links = findTags(content, ["a"]).map((t) => elementFor(content, t)).filter((e): e is Element => e !== null);
    for (const tag of findTags(content, ["img"])) {
      if (hasAttr(tag.attrs, "alt")) continue;
      if (attrValue(tag.attrs, "role") === "presentation" || attrValue(tag.attrs, "aria-hidden") === "true") continue;
      const at = line(content, tag.start);
      const src = attrValue(tag.attrs, "src") || attrValue(tag.attrs, "srcset") || "";
      const found = /\{\{-?\s*([a-z_][\w.[\]'"]*?)\s*\|\s*(image_url|img_url|product_img_url|collection_img_url)/i.exec(src)?.[1];
      const object = found && !/['"[\]]/.test(found) ? found : undefined;
      const link = enclosingLink(links, tag.start);
      const ownLogo = object === "settings.logo" || SHOP_LOGO.test(attrValue(tag.attrs, "class") ?? "");
      const homeLink = link !== undefined && SHOP_LOGO.test(link.attrs);
      if ((ownLogo || homeLink) && link && linkHasOtherText(content, link, tag)) {
        // The link's text already names it: the shop name again as alt would be read twice.
        edits.push({ tag, attr: 'alt=""' });
        notes.push(`Gave the image on line ${at} empty alt: the link around it already shows text.`);
      } else if (ownLogo) {
        const alt = object === "settings.logo" ? "{{ settings.logo.alt | default: shop.name | escape }}" : "{{ shop.name | escape }}";
        edits.push({ tag, attr: `alt="${alt}"` });
        notes.push(`Added the shop name as alt to the shop logo on line ${at}.`);
      } else if (object && IMAGE_OBJECT.test(object)) {
        edits.push({ tag, attr: `alt="{{ ${object}.alt | escape }}"` });
        notes.push(`Added alt from ${object}.alt to the image on line ${at}.`);
        notes.push(`Needs review: the image on line ${at} takes its alt from ${object}.alt. Where that is empty in the admin, the image renders as decorative (alt=""). Add alt text in the admin (Spike C).`);
      } else if (homeLink) {
        edits.push({ tag, attr: 'alt="{{ shop.name | escape }}"' });
        notes.push(`Added the shop name as alt to the image in the home link on line ${at}.`);
      } else {
        notes.push(`Needs review: <img> on line ${at} has no alt and its source does not say what it shows.`);
      }
    }
    if (!edits.length) return notes.length ? { file: path, before: content, after: content, type: this.type, fixer: this.id, notes } : null;
    return { file: path, before: content, after: insertAll(content, edits), type: this.type, fixer: this.id, notes };
  },
};

// ---------- low-contrast text (theme colour settings) ----------

// Dawn-family themes draw text as rgba(var(--color-foreground), alpha), so
// a setting that passes as solid colour can still fail on the page:
//   1     headings
//   0.75  body text, labels and menu items (layout/theme.liquid, base.css)
//   0.7   subtitles, unit prices, predictive search headings, facet counts
// 0.7 is the lowest opacity Dawn uses for text that must pass, so the fix
// aims for it. When no shade reaches it, the fix still makes 0.75 text pass
// and flags the 0.7 text for review. Lower opacities (0.55 placeholders,
// 0.5 slider counters) cannot reach 4.5:1 on white with any colour; a
// colour setting cannot fix them. Themes that do not use these opacities
// (ctx.dawnTextOpacity unset) are checked as solid colour only.
interface Need {
  fg: string;
  bg: string;
  alpha: number;
  required: boolean;
  what: string;
}

const solid = (fg: string, bg: string, what: string): Need => ({ fg, bg, alpha: 1, required: true, what });
const textNeeds = (fg: string, bg: string, dawn: boolean): Need[] =>
  dawn
    ? [
        { fg, bg, alpha: 1, required: true, what: "headings" },
        { fg, bg, alpha: 0.75, required: true, what: "body text" },
        { fg, bg, alpha: 0.7, required: false, what: "subtitles and unit prices" },
      ]
    : [solid(fg, bg, "text")];

// Dawn 10+ colour schemes, then the older Dawn and Online Store 2.0 keys.
// One foreground key can sit on several backgrounds: one colour must pass
// on all of them.
const schemeNeeds = (dawn: boolean): Need[] => [
  ...textNeeds("text", "background", dawn),
  solid("button_label", "button", "button labels"),
  solid("secondary_button_label", "background", "outline buttons and links"),
];
const legacyNeeds = (dawn: boolean): Need[] => [
  ...textNeeds("colors_text", "colors_background_1", dawn),
  ...textNeeds("colors_text", "colors_background_2", dawn),
  solid("colors_solid_button_labels", "colors_accent_1", "button labels"),
  solid("colors_outline_button_labels", "colors_background_1", "outline buttons"),
];

function stripComments(json: string): { head: string; body: string } {
  const m = /^\s*\/\*[\s\S]*?\*\/\s*/.exec(json);
  return m ? { head: m[0], body: json.slice(m[0].length) } : { head: "", body: json };
}

type Settings = Record<string, unknown>;

interface Group {
  label: string;
  path: string[]; // where the settings object sits in settings_data.json
  needs: Need[];
}

interface Plan {
  group: Group;
  fg: string;
  from: string;
  to: string | null; // null: nothing changes
  unmet: Need[]; // still under 4.5:1 after the plan
}

const hexOf = (settings: Settings, key: string) => (typeof settings[key] === "string" ? parseHex(settings[key] as string) : null);

function settingsAt(data: unknown, path: string[]): Settings | undefined {
  let cur: unknown = data;
  for (const k of path) cur = cur && typeof cur === "object" ? (cur as Settings)[k] : undefined;
  return cur && typeof cur === "object" ? (cur as Settings) : undefined;
}

function planGroup(group: Group, settings: Settings): Plan[] {
  const plans: Plan[] = [];
  for (const fgKey of new Set(group.needs.map((n) => n.fg))) {
    const fg = hexOf(settings, fgKey);
    const needs = group.needs.filter((n) => n.fg === fgKey && hexOf(settings, n.bg));
    if (!fg || !needs.length) continue;
    const backdrop = (n: Need) => ({ bg: hexOf(settings, n.bg)!, alpha: n.alpha });
    const fails = (c: RGB, n: Need) => contrastAt(c, backdrop(n).bg, n.alpha) < 4.5;
    if (!needs.some((n) => fails(fg, n))) continue;
    const from = String(settings[fgKey]);
    const all = solveColor(fg, needs.map(backdrop));
    const color = all ?? solveColor(fg, needs.filter((n) => n.required).map(backdrop));
    if (!color) {
      plans.push({ group, fg: fgKey, from, to: null, unmet: needs.filter((n) => fails(fg, n)) });
      continue;
    }
    const to = toHex(color) === toHex(fg) ? null : toHex(color);
    plans.push({ group, fg: fgKey, from, to, unmet: needs.filter((n) => fails(color, n)) });
  }
  return plans;
}

// Ratios measured on the given settings, grouped by background.
function measure(settings: Settings, fgKey: string, needs: Need[]): string {
  const fg = hexOf(settings, fgKey)!;
  const byBg = new Map<string, Need[]>();
  for (const n of needs) byBg.set(n.bg, [...(byBg.get(n.bg) ?? []), n]);
  return [...byBg]
    .map(([bgKey, list]) => {
      const bg = hexOf(settings, bgKey)!;
      const ratios = list.map((n) => `${contrast(blend(fg, bg, n.alpha), bg).toFixed(2)}:1 at ${Math.round(n.alpha * 100)}%`);
      return `on ${bgKey} ${String(settings[bgKey])}: ${ratios.join(", ")}`;
    })
    .join("; ");
}

function describe(needs: Need[]): string {
  return [...new Set(needs.map((n) => `${n.what} (${Math.round(n.alpha * 100)}% opacity)`))].join(", ");
}

export const lowContrast: Fixer = {
  id: "low-contrast/color-settings",
  type: "low-contrast",
  fixFile(path, content, ctx) {
    if (path !== "config/settings_data.json") return null;
    const dawn = ctx.dawnTextOpacity === true;
    const { head, body } = stripComments(content);
    let data: { current?: unknown; presets?: Record<string, Settings> };
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }
    // "current" is either the live settings object or the name of a preset.
    const base = typeof data.current === "string" ? ["presets", data.current] : ["current"];
    const live = settingsAt(data, base);
    if (!live) return null;

    const groups: Group[] = [];
    const schemes = live.color_schemes;
    if (schemes && typeof schemes === "object") {
      for (const name of Object.keys(schemes)) {
        groups.push({ label: `Colour scheme ${name}`, path: [...base, "color_schemes", name, "settings"], needs: schemeNeeds(dawn) });
      }
    }
    groups.push({ label: "Theme colours", path: base, needs: legacyNeeds(dawn) });

    const plans = groups.flatMap((g) => {
      const settings = settingsAt(data, g.path);
      return settings ? planGroup(g, settings) : [];
    });
    let text = body;
    for (const p of plans) if (p.to) text = setString(text, [...p.group.path, p.fg], p.to);

    // Notes state what the new file measures, not what the plan expected.
    const after = JSON.parse(text);
    const notes: string[] = [];
    for (const p of plans) {
      const settings = settingsAt(after, p.group.path)!;
      const needs = p.group.needs.filter((n) => n.fg === p.fg && hexOf(settings, n.bg));
      const now = measure(settings, p.fg, needs);
      if (p.to) notes.push(`${p.group.label}: changed ${p.fg} from ${p.from} to ${p.to}, same hue. Measured after the change ${now}.`);
      if (!p.unmet.length) continue;
      const bgs = [...new Set(p.unmet.map((n) => `${n.bg} ${String(settings[n.bg])}`))].join(" and ");
      const unmet = measure(settings, p.fg, p.unmet);
      if (p.unmet.some((n) => n.required)) {
        notes.push(`Needs review: ${p.group.label}: no single shade of ${p.fg} ${p.from} reaches 4.5:1 for ${describe(p.unmet)} on ${bgs}. Nothing changed. Measured ${now}.`);
      } else {
        notes.push(`Needs review: ${p.group.label}: ${describe(p.unmet)} measure under 4.5:1 (${unmet}). No single shade of ${p.fg} passes this and the other text; the background or the theme's CSS must change.`);
      }
    }
    const result = head + text;
    if (result === content && !notes.length) return null;
    return { file: path, before: content, after: result, type: this.type, fixer: this.id, notes };
  },
};

export const ALL_FIXERS: Fixer[] = [lowContrast, missingAlt, missingLabel, emptyLink, emptyButton, missingLang];
