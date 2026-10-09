// Contrast fixer regressions from the PR #35 review (findings 3 to 5).
import { describe, expect, it } from "vitest";
import { contrast, parseHex, type RGB } from "../../app/lib/fixers/color";
import { contextFor } from "../../app/lib/fixers/engine";
import { lowContrast } from "../../app/lib/fixers/fixers";

const FILE = "config/settings_data.json";
// A Dawn-family theme: text drawn at 75% and 70% opacity.
const DAWN = { dawnTextOpacity: true };

// Text drawn as rgba(text, alpha) over the background, the way Dawn does it.
function ratio(text: string, bg: string, alpha = 1): number {
  const f = parseHex(text)!;
  const b = parseHex(bg)!;
  const mix = (x: number, y: number) => x * alpha + y * (1 - alpha);
  const blended: RGB = { r: mix(f.r, b.r), g: mix(f.g, b.g), b: mix(f.b, b.b) };
  return contrast(blended, b);
}

const parse = (text: string) => JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));
const review = (notes: string[]) => notes.filter((n) => n.startsWith("Needs review"));
const ratiosIn = (note: string) => [...note.matchAll(/(\d+\.\d\d):1/g)].map((m) => Number(m[1]));

function schemes(entries: Record<string, Record<string, string>>, before = ""): string {
  const body = Object.entries(entries)
    .map(([name, s]) => `      "${name}": { "settings": ${JSON.stringify(s)} }`)
    .join(",\n");
  return `{\n  "current": {\n${before}    "color_schemes": {\n${body}\n    }\n  }\n}`;
}

describe("text opacity (review 3)", () => {
  it("solves for Dawn's 75% body text and 70% secondary text, not solid text", () => {
    const src = schemes({ "scheme-1": { background: "#FFFFFF", text: "#BBBBBB", button: "#121212", button_label: "#FFFFFF", secondary_button_label: "#121212" } });
    const p = lowContrast.fixFile(FILE, src, DAWN)!;
    const s = parse(p.after).current.color_schemes["scheme-1"].settings;
    expect(ratio(s.text, s.background, 1)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.text, s.background, 0.75)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.text, s.background, 0.7)).toBeGreaterThanOrEqual(4.5);
    // Still the smallest change that does it.
    expect(ratio(s.text, s.background, 0.7)).toBeLessThan(4.7);
    expect(review(p.notes)).toEqual([]);
    expect(lowContrast.fixFile(FILE, p.after, DAWN)).toBeNull();
  });

  it("flags 70% text it cannot fix, and changes nothing when 75% text passes", () => {
    // Dawn 16 scheme-5: white text on blue is 4.83:1 at 75% but 4.43:1 at 70%.
    const src = schemes({ "scheme-5": { background: "#334FB4", text: "#FFFFFF", button: "#FFFFFF", button_label: "#334FB4", secondary_button_label: "#FFFFFF" } });
    const p = lowContrast.fixFile(FILE, src, DAWN)!;
    expect(p.after).toBe(src);
    expect(review(p.notes)).toHaveLength(1);
    expect(p.notes[0]).toMatch(/scheme-5.*70%/);
    expect(ratiosIn(p.notes[0])).toContain(Number(ratio("#FFFFFF", "#334FB4", 0.7).toFixed(2)));
  });

  it("fixes 75% text when 70% text cannot pass, and flags the rest", () => {
    const src = schemes({ "scheme-5": { background: "#334FB4", text: "#CCCCCC", button: "#FFFFFF", button_label: "#334FB4", secondary_button_label: "#FFFFFF" } });
    const p = lowContrast.fixFile(FILE, src, DAWN)!;
    const s = parse(p.after).current.color_schemes["scheme-5"].settings;
    expect(ratio(s.text, s.background, 0.75)).toBeGreaterThanOrEqual(4.5);
    expect(review(p.notes)).toHaveLength(1);
    expect(review(p.notes)[0]).toMatch(/70%/);
  });
});

describe("one colour for every background (review 4)", () => {
  const legacy = (text: string, bg1: string, bg2: string) => `{
  "current": {
    "colors_text": "${text}",
    "colors_background_1": "${bg1}",
    "colors_background_2": "${bg2}",
    "colors_solid_button_labels": "#FFFFFF",
    "colors_accent_1": "#121212",
    "colors_outline_button_labels": "#121212"
  }
}`;

  it("changes nothing and asks for review when no colour passes both backgrounds", () => {
    const src = legacy("#888888", "#FFFFFF", "#333333");
    const p = lowContrast.fixFile(FILE, src, DAWN)!;
    expect(p.after).toBe(src);
    expect(review(p.notes)).toHaveLength(1);
    expect(p.notes[0]).toMatch(/colors_text.*colors_background_1.*colors_background_2/);
    expect(p.notes.join(" ")).not.toMatch(/changed \w+ from/);
    expect(p.notes[0]).toMatch(/Nothing changed/);
  });

  it("finds one colour that passes both backgrounds and states the measured ratios", () => {
    const src = legacy("#999999", "#FFFFFF", "#F3F3F3");
    const p = lowContrast.fixFile(FILE, src, DAWN)!;
    const d = parse(p.after).current;
    for (const bg of [d.colors_background_1, d.colors_background_2]) {
      for (const a of [1, 0.75, 0.7]) expect(ratio(d.colors_text, bg, a)).toBeGreaterThanOrEqual(4.5);
    }
    expect(p.notes).toHaveLength(1);
    expect(p.notes[0]).toContain(d.colors_text);
    // The note's numbers are measured on the new file, not predicted.
    const expected = [d.colors_background_1, d.colors_background_2].flatMap((bg) => [1, 0.75, 0.7].map((a) => Number(ratio(d.colors_text, bg, a).toFixed(2))));
    expect(ratiosIn(p.notes[0])).toEqual(expected);
    expect(lowContrast.fixFile(FILE, p.after, DAWN)).toBeNull();
  });
});

describe("scheme names used as values (review 5)", () => {
  it("changes the scheme itself, not the first string that names it", () => {
    const src = schemes(
      {
        "scheme-1": { background: "#121212", text: "#FFFFFF", button: "#FFFFFF", button_label: "#121212", secondary_button_label: "#FFFFFF" },
        "scheme-2": { background: "#FFFFFF", text: "#BBBBBB", button: "#121212", button_label: "#FFFFFF", secondary_button_label: "#121212" },
      },
      `    "cart_color_scheme": "scheme-2",\n    "drawer": { "scheme-2": "not this one" },\n`,
    );
    const p = lowContrast.fixFile(FILE, src, DAWN)!;
    const d = parse(p.after).current;
    expect(d.color_schemes["scheme-1"].settings.text).toBe("#FFFFFF");
    expect(d.cart_color_scheme).toBe("scheme-2");
    expect(d.drawer).toEqual({ "scheme-2": "not this one" });
    const s2 = d.color_schemes["scheme-2"].settings;
    expect(ratio(s2.text, s2.background, 0.7)).toBeGreaterThanOrEqual(4.5);
    // Only the one value changed.
    expect(p.after.replace(s2.text, "#BBBBBB")).toBe(src);
    // Idempotent: a second run changes nothing.
    expect(lowContrast.fixFile(FILE, p.after, DAWN)).toBeNull();
  });
});

describe("themes that draw text solid (re-review B)", () => {
  const scheme = (text: string) => schemes({ s: { background: "#FFFFFF", text, button: "#000000", button_label: "#FFFFFF", secondary_button_label: "#000000" } });

  it("checks solid colour only when the theme does not use Dawn's opacities", () => {
    // #555555 on white is 7.46:1 as solid text.
    expect(lowContrast.fixFile(FILE, scheme("#555555"), {})).toBeNull();
    expect(lowContrast.fixFile(FILE, scheme("#555555"), DAWN)!.after).not.toBe(scheme("#555555"));
    const p = lowContrast.fixFile(FILE, scheme("#BBBBBB"), {})!;
    const s = parse(p.after).current.color_schemes.s.settings;
    expect(ratio(s.text, s.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.text, s.background)).toBeLessThan(4.7);
    expect(p.notes[0]).not.toMatch(/75%/);
  });

  it("detects Dawn's text opacity in layout/theme.liquid or assets/base.css", () => {
    const rule = "body { color: rgba(var(--color-foreground), 0.75); }";
    expect(contextFor(new Map([["layout/theme.liquid", `<style>${rule}</style>`]])).dawnTextOpacity).toBe(true);
    expect(contextFor(new Map([["assets/base.css", rule]])).dawnTextOpacity).toBe(true);
    expect(contextFor(new Map([["assets/base.css", "body { color: rgb(var(--color-foreground)); }"]])).dawnTextOpacity).toBe(false);
  });
});
