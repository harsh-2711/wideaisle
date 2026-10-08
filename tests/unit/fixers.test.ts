import { describe, expect, it } from "vitest";
import { adjustForContrast, contrast, parseHex, toHex } from "../../app/lib/fixers/color";
import { applyFixes, fixTheme, revertFixes } from "../../app/lib/fixers/engine";
import { attrSafe, emptyButton, emptyLink, lowContrast, missingAlt, missingLabel, missingLang } from "../../app/lib/fixers/fixers";
import { elementFor, findTags, hasNoText } from "../../app/lib/fixers/liquid-html";

const ctx = {};

describe("colour maths", () => {
  it("matches the WCAG contrast formula", () => {
    expect(contrast(parseHex("#000")!, parseHex("#fff")!)).toBeCloseTo(21, 5);
    expect(contrast(parseHex("#777777")!, parseHex("#ffffff")!)).toBeCloseTo(4.48, 2);
  });

  it("reaches 4.5:1 with the smallest lightness change and keeps the hue", () => {
    const fg = parseHex("#bbbbbb")!;
    const bg = parseHex("#ffffff")!;
    const fixed = adjustForContrast(fg, bg);
    expect(contrast(fixed, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fixed, bg)).toBeLessThan(4.7);
    const brand = adjustForContrast(parseHex("#ff7a59")!, bg);
    expect(contrast(brand, bg)).toBeGreaterThanOrEqual(4.5);
    expect(toHex(brand)).toMatch(/^#[A-F0-9]{6}$/);
    expect(brand.r).toBeGreaterThan(brand.b); // still orange
  });

  it("leaves passing colours alone", () => {
    expect(adjustForContrast(parseHex("#121212")!, parseHex("#ffffff")!)).toEqual(parseHex("#121212"));
  });
});

describe("liquid tag scanner", () => {
  it("finds tags with Liquid inside attributes and skips non-markup regions", () => {
    const src = `{% comment %}<a href="/x"></a>{% endcomment %}
<a href="{{ routes.cart_url }}" class="{% if x > 1 %}big{% endif %}">{% render 'icon-cart' %}</a>
{% schema %}{"a": "<a href='/y'></a>"}{% endschema %}
<script>var s = "<a href='/z'></a>";</script>`;
    const tags = findTags(src, ["a"]);
    expect(tags).toHaveLength(1);
    const el = elementFor(src, tags[0])!;
    expect(el.inner).toBe("{% render 'icon-cart' %}");
  });

  it("tells icon-only content from content with a name", () => {
    expect(hasNoText("{% render 'icon-cart' %}")).toBe(true);
    expect(hasNoText("<svg><path/></svg>\n  ")).toBe(true);
    expect(hasNoText('<span class="icon" aria-hidden="true">x</span>')).toBe(true);
    expect(hasNoText('<span class="visually-hidden">Cart</span>{% render "icon-cart" %}')).toBe(false);
    expect(hasNoText("{{ 'general.cart' | t }}")).toBe(false);
    expect(hasNoText('<img src="x" alt="">')).toBe(true);
    expect(hasNoText('<img src="x" alt="{{ image.alt }}">')).toBe(false);
  });
});

describe("missing-lang", () => {
  it("adds lang to <html> in layouts only, once", () => {
    const src = '<!doctype html>\n<html class="no-js">\n<head></head></html>';
    const p = missingLang.fixFile("layout/theme.liquid", src, ctx)!;
    expect(p.after).toContain('<html lang="{{ request.locale.iso_code }}" class="no-js">');
    expect(missingLang.fixFile("layout/theme.liquid", p.after, ctx)).toBeNull();
    expect(missingLang.fixFile("sections/x.liquid", src, ctx)).toBeNull();
  });
});

describe("empty links and buttons", () => {
  const header = `<a href="{{ routes.cart_url }}" class="header__icon">{% render 'icon-cart' %}</a>
<a href="{{ routes.search_url }}"><svg><path/></svg></a>
<a href="{{ settings.social_instagram_link }}">{%- render 'icon-instagram' -%}</a>
<a href="/" class="site-header__logo"><img src="{{ 'logo.png' | asset_url }}" alt=""></a>
<a href="/pages/about">About us</a>
<a href="{{ routes.cart_url }}" aria-label="Cart">{% render 'icon-cart' %}</a>
<a href="/mystery"><svg></svg></a>`;

  it("names icon-only links from their clues and skips named ones", () => {
    const p = emptyLink.fixFile("sections/header.liquid", header, ctx)!;
    expect(p.after).toContain('<a aria-label="Cart" href="{{ routes.cart_url }}" class="header__icon">');
    expect(p.after).toContain('<a aria-label="Search" href="{{ routes.search_url }}">');
    expect(p.after).toContain('<a aria-label="Instagram"');
    expect(p.after).toContain('<a aria-label="{{ shop.name | escape }}" href="/" class="site-header__logo">');
    expect(p.after).toContain('<a href="/pages/about">About us</a>');
    expect(p.after.match(/aria-label="Cart"/g)).toHaveLength(2);
    expect(p.notes.some((n) => n.startsWith("Needs review") && n.includes("line 7"))).toBe(true);
    expect(p.after).toContain('<a href="/mystery">');
    expect(emptyLink.fixFile("sections/header.liquid", p.after, ctx)?.after ?? p.after).toBe(p.after);
  });

  it("uses the theme's translation keys when they exist", () => {
    const locale = { accessibility: { close: "Close" }, general: { social: { links: { instagram: "Instagram" } } } };
    const src = `<button class="drawer__close" type="button">{% render 'icon-close' %}</button>`;
    const p = emptyButton.fixFile("snippets/drawer.liquid", src, { locale })!;
    expect(p.after).toContain(`<button aria-label="{{ 'accessibility.close' | t }}" class="drawer__close"`);
  });

  it("names quantity, slider and menu buttons", () => {
    const src = `<button name="minus" type="button">{% render 'icon-minus' %}</button>
<button name="plus" type="button">{% render 'icon-plus' %}</button>
<button class="slider-button slider-button--next">{% render 'icon-caret' %}</button>
<button class="header__menu-toggle">{% render 'icon-hamburger' %}</button>
<button type="submit">Add to cart</button>`;
    const p = emptyButton.fixFile("sections/main-product.liquid", src, ctx)!;
    expect(p.after).toContain('aria-label="Decrease quantity"');
    expect(p.after).toContain('aria-label="Increase quantity"');
    expect(p.after).toContain('aria-label="Next slide"');
    expect(p.after).toContain('aria-label="Menu"');
    expect(p.after).toContain('<button type="submit">Add to cart</button>');
  });
});

describe("missing-label", () => {
  it("labels unlabelled fields from placeholder or clues, and leaves labelled ones", () => {
    const src = `<form>
<input type="email" name="contact[email]" placeholder="{{ 'newsletter.label' | t }}">
<input type="search" name="q">
<label for="Qty">Quantity</label><input id="Qty" type="number" name="quantity">
<label>Name <input type="text" name="contact[name]"></label>
<input type="hidden" name="form_type" value="customer">
<input type="text" name="mystery_field">
</form>`;
    const p = missingLabel.fixFile("sections/newsletter.liquid", src, ctx)!;
    expect(p.after).toContain(`<input aria-label="{{ 'newsletter.label' | t }}" type="email"`);
    expect(p.after).toContain('<input aria-label="Search" type="search" name="q">');
    expect(p.after).toContain('<input id="Qty" type="number" name="quantity">');
    expect(p.after).toContain('<label>Name <input type="text" name="contact[name]"></label>');
    expect(p.after).toContain('<input type="hidden"');
    expect(p.notes.some((n) => n.startsWith("Needs review"))).toBe(true);
  });
});

describe("attribute safety", () => {
  it("escapes copied text and keeps Liquid intact", () => {
    expect(attrSafe('Say "hi" & <go>')).toBe("Say &quot;hi&quot; &amp; &lt;go>");
    expect(attrSafe(`{{ "newsletter.label" | t }}`)).toBe(`{{ 'newsletter.label' | t }}`);
    expect(attrSafe("Tom &amp; Jerry")).toBe("Tom &amp; Jerry");
  });

  it("never breaks out of the attribute when a placeholder holds quotes", () => {
    const src = `<input type="email" placeholder='Your "best" email'>`;
    const p = missingLabel.fixFile("sections/x.liquid", src, {})!;
    expect(p.after).toContain('aria-label="Your &quot;best&quot; email"');
  });

  it("skips images whose source expression holds quotes", () => {
    const src = `<img src="{{ product.images["front"] | image_url }}">`;
    const p = missingAlt.fixFile("sections/x.liquid", src, {});
    expect(p?.after ?? src).not.toContain("alt=");
  });
});

describe("missing-alt", () => {
  it("adds alt from the image object, or the shop name for logos", () => {
    const src = `<img src="{{ product.featured_image | image_url: width: 400 }}" width="400">
<img class="header__heading-logo" src="{{ 'logo.png' | asset_url }}">
<img src="{{ block.settings.image | image_url }}" alt="{{ block.settings.image.alt }}">
<img src="https://cdn.example/x.png">`;
    const p = missingAlt.fixFile("sections/featured.liquid", src, ctx)!;
    expect(p.after).toContain('<img alt="{{ product.featured_image.alt | escape }}" src=');
    expect(p.after).toContain('<img alt="{{ shop.name | escape }}" class="header__heading-logo"');
    expect(p.after.match(/alt=/g)).toHaveLength(3); // three images end with alt, one needs review
    expect(p.notes.some((n) => n.startsWith("Needs review"))).toBe(true);
  });
});

describe("low-contrast", () => {
  const settings = `/*
 * IMPORTANT: The contents of this file are auto-generated.
 */
{
  "current": {
    "color_schemes": {
      "scheme-1": { "settings": { "background": "#FFFFFF", "text": "#BBBBBB", "button": "#FF7A59", "button_label": "#FFFFFF", "secondary_button_label": "#121212" } },
      "scheme-2": { "settings": { "background": "#121212", "text": "#FFFFFF", "button": "#FFFFFF", "button_label": "#121212", "secondary_button_label": "#FFFFFF" } }
    }
  },
  "presets": { "Default": { "color_schemes": {} } }
}`;

  it("raises failing scheme colours to 4.5:1 and leaves the rest of the file as it was", () => {
    const p = lowContrast.fixFile("config/settings_data.json", settings, ctx)!;
    expect(p.after.startsWith("/*\n * IMPORTANT")).toBe(true);
    const data = JSON.parse(p.after.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ""));
    const s1 = data.current.color_schemes["scheme-1"].settings;
    expect(contrast(parseHex(s1.text)!, parseHex(s1.background)!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parseHex(s1.button_label)!, parseHex(s1.button)!)).toBeGreaterThanOrEqual(4.5);
    expect(s1.background).toBe("#FFFFFF");
    expect(s1.button).toBe("#FF7A59");
    expect(data.current.color_schemes["scheme-2"].settings.text).toBe("#FFFFFF");
    expect(p.notes).toHaveLength(2);
    expect(lowContrast.fixFile("config/settings_data.json", p.after, ctx)).toBeNull();
  });
});

describe("engine", () => {
  it("chains fixers per file, and revert restores the original exactly", () => {
    const theme = new Map([
      ["layout/theme.liquid", '<html class="js"><body><a href="{{ routes.cart_url }}">{% render "icon-cart" %}</a></body></html>'],
      ["sections/footer.liquid", '<p>Footer</p>'],
    ]);
    const report = fixTheme(theme);
    expect(report.files).toHaveLength(1);
    expect(report.files[0].patches.map((p) => p.type).sort()).toEqual(["empty-link", "missing-lang"]);
    const fixed = applyFixes(theme, report);
    expect(fixed.get("layout/theme.liquid")).toContain('lang="{{ request.locale.iso_code }}"');
    expect(fixTheme(fixed).files).toHaveLength(0);
    expect(revertFixes(fixed, report)).toEqual(theme);
  });
});
