// Fixers on real Dawn 16.0.0 source (commit 258f00f6). The files in
// fixtures/dawn-16/ are copied verbatim from Shopify/dawn: snippets
// header-drawer.liquid and quantity-input.liquid, and config/settings_data.json.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, parseHex, type RGB } from "../../app/lib/fixers/color";
import { fixTheme } from "../../app/lib/fixers/engine";
import { emptyButton, emptyLink, lowContrast } from "../../app/lib/fixers/fixers";

const DIR = path.join(import.meta.dirname, "fixtures", "dawn-16");
const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");

// Values from Dawn 16 locales/en.default.json.
const locale = {
  accessibility: { close: "Close" },
  sections: { header: { menu: "Menu" } },
  general: { social: { links: { twitter: "X (Twitter)", facebook: "Facebook", pinterest: "Pinterest", instagram: "Instagram", tiktok: "TikTok", tumblr: "Tumblr", snapchat: "Snapchat", youtube: "YouTube", vimeo: "Vimeo" } } },
  products: { product: { quantity: { label: "Quantity", input_label: "Quantity for {{ product }}", increase: "Increase quantity for {{ product }}", decrease: "Decrease quantity for {{ product }}" } } },
};

// Dawn's layout/theme.liquid draws body text at rgba(var(--color-foreground), 0.75).
const DAWN = { locale, dawnTextOpacity: true };

const withoutHiddenText = (src: string) => src.replace(/<span class="visually-hidden">[\s\S]*?<\/span>/g, "");

describe("Dawn 16 header drawer", () => {
  const src = read("header-drawer.liquid");

  it("changes nothing and flags nothing on stock Dawn", () => {
    const report = fixTheme(new Map([["snippets/header-drawer.liquid", src]]), undefined, { locale });
    expect(report.files).toEqual([]);
    expect(report.review).toEqual([]);
  });

  it("names social links from Dawn's own keys when their hidden text is gone", () => {
    const stripped = withoutHiddenText(src);
    const p = emptyLink.fixFile("snippets/header-drawer.liquid", stripped, { locale })!;
    expect(p.after).toContain(`<a aria-label="{{ 'general.social.links.twitter' | t }}" href="{{ settings.social_twitter_link }}"`);
    expect(p.after.match(/aria-label="\{\{ 'general\.social\.links\.\w+' \| t \}\}"/g)).toHaveLength(9);
    // The {% doc %} example and the menu links are left alone.
    expect(p.after.startsWith("{% doc %}\n  Renders a header drawer menu")).toBe(true);
    expect(p.notes.filter((n) => n.startsWith("Needs review"))).toEqual([]);
    expect(emptyLink.fixFile("snippets/header-drawer.liquid", p.after, { locale })).toBeNull();
  });
});

describe("Dawn 16 quantity buttons", () => {
  const src = read("quantity-input.liquid");

  it("changes nothing on stock Dawn", () => {
    expect(fixTheme(new Map([["snippets/quantity-input.liquid", src]]), undefined, { locale }).files).toEqual([]);
  });

  it("names the buttons in English, since Dawn's keys need {{ product }}", () => {
    const p = emptyButton.fixFile("snippets/quantity-input.liquid", withoutHiddenText(src), { locale })!;
    expect(p.after).toContain(`<button aria-label="Decrease quantity" class="quantity__button" name="minus"`);
    expect(p.after).toContain(`<button aria-label="Increase quantity" class="quantity__button" name="plus"`);
    expect(p.after).not.toContain("quantity.increase' | t");
  });
});

describe("Dawn 16 settings_data.json", () => {
  const stock = read("settings_data.json");
  // A merchant picks light grey text for scheme 2. "current" names the
  // "Dawn" preset, and "scheme-2" also appears as a value
  // ("card_color_scheme": "scheme-2").
  const at = stock.indexOf('"text": "#121212"', stock.indexOf('"scheme-2": {'));
  const edited = stock.slice(0, at) + '"text": "#AAAAAA"' + stock.slice(at + '"text": "#121212"'.length);
  const parse = (t: string) => JSON.parse(t.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));
  const at70 = (text: string, background: string) => {
    const f = parseHex(text)!;
    const b = parseHex(background)!;
    const mix: RGB = { r: f.r * 0.7 + b.r * 0.3, g: f.g * 0.7 + b.g * 0.3, b: f.b * 0.7 + b.b * 0.3 };
    return contrast(mix, b);
  };

  it("fixes the preset's failing scheme and nothing else", () => {
    expect(parse(edited).current).toBe("Dawn");
    const p = lowContrast.fixFile("config/settings_data.json", edited, DAWN)!;
    const d = parse(p.after);
    const s2 = d.presets.Dawn.color_schemes["scheme-2"].settings;
    expect(s2.text).not.toBe("#AAAAAA");
    expect(at70(s2.text, s2.background)).toBeGreaterThanOrEqual(4.5);
    expect(d.current).toBe("Dawn");
    expect(d.presets.Dawn.card_color_scheme).toBe("scheme-2");
    // Every other byte is as it was.
    expect(p.after.replace(`"text": "${s2.text}"`, '"text": "#AAAAAA"')).toBe(edited);
    expect(p.notes[0]).toMatch(/^Colour scheme scheme-2: changed text from #AAAAAA to #[0-9A-F]{6}, same hue\./);
    // Scheme 5 is the one stock gap: 70% text on #334FB4.
    expect(p.notes.filter((n) => n.startsWith("Needs review"))).toHaveLength(1);
    expect(p.notes[1]).toMatch(/^Needs review: Colour scheme scheme-5/);
    // A second run changes nothing.
    const again = lowContrast.fixFile("config/settings_data.json", p.after, DAWN)!;
    expect(again.after).toBe(again.before);
  });

  it("leaves stock Dawn's colours alone", () => {
    const p = lowContrast.fixFile("config/settings_data.json", stock, DAWN)!;
    expect(p.after).toBe(stock);
  });
});
