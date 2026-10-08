// Regressions from the PR #35 review. Each test failed before its fix.
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";
import { attrSafe, emptyButton, emptyLink, missingAlt, missingLabel } from "../../app/lib/fixers/fixers";
import { attrValue, findTags, hasAttr, hasNoText } from "../../app/lib/fixers/liquid-html";

const liquid = new Liquid();
const parses = (src: string) => {
  liquid.parse(src);
  return true;
};

describe("copying placeholder values (review 2)", () => {
  it("reads a double-quoted value that holds Liquid with double quotes", () => {
    const src = `<input type="email" placeholder="{{ "newsletter.label" | t }}">`;
    expect(attrValue(src.slice(6, -1), "placeholder")).toBe(`{{ "newsletter.label" | t }}`);
    const p = missingLabel.fixFile("sections/x.liquid", src, {})!;
    expect(p.after).toBe(`<input aria-label="{{ 'newsletter.label' | t }}" type="email" placeholder="{{ "newsletter.label" | t }}">`);
    expect(parses(p.after)).toBe(true);
  });

  it("reads an unquoted Liquid value whole", () => {
    const src = `<input type="email" placeholder={{ 'newsletter.label' | t }}>`;
    const p = missingLabel.fixFile("sections/x.liquid", src, {})!;
    expect(p.after).toContain(`<input aria-label="{{ 'newsletter.label' | t }}" type="email"`);
    expect(parses(p.after)).toBe(true);
  });

  it("sends values with unbalanced Liquid to review instead of copying them", () => {
    for (const src of [
      `<input type="text" placeholder="Save 10 }} today">`,
      `<input type="text" placeholder="{% if a %}Email"{% endif %}>`,
      `<input type="text" placeholder="{{ "it's" }}">`,
    ]) {
      const p = missingLabel.fixFile("sections/x.liquid", src, {})!;
      expect(p.after, src).toBe(src);
      expect(p.notes.some((n) => n.startsWith("Needs review")), src).toBe(true);
    }
  });
});

describe("attribute escaping (review 12)", () => {
  it("keeps named and numeric entities as they are", () => {
    expect(attrSafe("Caf&eacute; &rsquo;s email")).toBe("Caf&eacute; &rsquo;s email");
    expect(attrSafe("it&#x27;s &#39;")).toBe("it&#x27;s &#39;");
    expect(attrSafe("Fish & chips")).toBe("Fish &amp; chips");
  });
});

describe("tag scanner (reviews 13 to 15)", () => {
  it("skips {% doc %} blocks", () => {
    const src = `{% doc %}\n  @example\n  <a href="/cart">{% render 'icon-cart' %}</a>\n{% enddoc %}\n<p>x</p>`;
    expect(findTags(src, ["a"])).toHaveLength(0);
    expect(emptyLink.fixFile("snippets/x.liquid", src, {})).toBeNull();
  });

  it("does not treat <script-loader> or <style-x> as script or style", () => {
    const src = `<script-loader></script-loader>\n<a href="/cart">{% render 'icon-cart' %}</a>\n<style-x></style-x><a href="/search">{% render 'icon-search' %}</a>\n<script>x()</script>`;
    expect(findTags(src, ["a"])).toHaveLength(2);
  });

  it("reads attribute names, not words inside values", () => {
    expect(hasAttr(`href="/cart" class="title icon"`, "title")).toBe(false);
    expect(hasAttr(`data-title="x"`, "title")).toBe(false);
    expect(hasAttr(`href="/" title="Home"`, "title")).toBe(true);
    expect(hasAttr(`{% if x %}title="{{ y }}"{% endif %}`, "title")).toBe(true);
    expect(hasAttr(`class="a" hidden`, "hidden")).toBe(true);
    const p = emptyLink.fixFile("snippets/x.liquid", `<a href="{{ routes.cart_url }}" class="title icon">{% render 'icon-cart' %}</a>`, {})!;
    expect(p.after).toContain(`<a aria-label="Cart" href=`);
  });
});

describe("content that renders text (review 9)", () => {
  it("counts snippets, echo, liquid and section tags as text", () => {
    expect(hasNoText("{% render 'button-label', text: 'Close and continue' %}")).toBe(false);
    expect(hasNoText("{% render 'cart-icon-with-count' %}")).toBe(false);
    expect(hasNoText("{% render 'icon-with-text' %}")).toBe(false);
    expect(hasNoText("{% echo 'templates.cart.cart' | t %}")).toBe(false);
    expect(hasNoText("{%- liquid\n  echo 'templates.cart.cart' | t\n-%}")).toBe(false);
    expect(hasNoText("{% section 'cart-count' %}")).toBe(false);
    expect(hasNoText("{% include 'cart-count' %}")).toBe(false);
  });

  it("still treats icon renders and logic as empty", () => {
    expect(hasNoText("{% render 'icon-cart' %}")).toBe(true);
    expect(hasNoText("{%- if cart == empty -%}{% render 'icon-cart-empty' %}{%- else -%}{% render 'icon-cart' %}{%- endif -%}")).toBe(true);
    expect(hasNoText("{{ 'icon-cart.svg' | inline_asset_content }}")).toBe(true);
  });

  it("leaves a cart link alone when a snippet draws its count", () => {
    const src = `<a href="{{ routes.cart_url }}" class="cart-link">{% render 'cart-icon-with-count' %}</a>`;
    expect(emptyLink.fixFile("snippets/x.liquid", src, {})).toBeNull();
    const btn = `<button class="drawer__close-text" type="button">{% render 'button-label', text: 'Close and continue' %}</button>`;
    expect(emptyButton.fixFile("snippets/x.liquid", btn, {})).toBeNull();
  });
});

const review = (notes: string[]) => notes.filter((n) => n.startsWith("Needs review"));

describe("alt text from image objects (review 6)", () => {
  it("uses .alt only on image, featured_image, featured_media, media or preview_image", () => {
    for (const obj of ["product", "collection", "article", "section.settings.image_2", "product.images.first"]) {
      const src = `<img src="{{ ${obj} | image_url: width: 300 }}">`;
      const p = missingAlt.fixFile("sections/x.liquid", src, {})!;
      expect(p.after, obj).toBe(src);
      expect(review(p.notes), obj).toHaveLength(1);
    }
    for (const obj of ["section.settings.image", "product.featured_image", "product.featured_media", "media", "media.preview_image"]) {
      const src = `<img src="{{ ${obj} | image_url: width: 300 }}">`;
      const p = missingAlt.fixFile("sections/x.liquid", src, {})!;
      expect(p.after, obj).toBe(`<img alt="{{ ${obj}.alt | escape }}" src="{{ ${obj} | image_url: width: 300 }}">`);
      // Empty alt in the admin renders as decorative: a person must check.
      expect(review(p.notes).join(" "), obj).toMatch(/decorative/);
    }
  });
});

describe("shop logos (review 7)", () => {
  it("gives the shop name only to the shop's own logo", () => {
    const own = `<img src="{{ settings.logo | image_url: width: 200 }}" class="header__heading-logo">
<a href="{{ routes.root_url }}"><img src="{{ 'logo.png' | asset_url }}"></a>
<a href="/"><img src="{{ 'brand.svg' | asset_url }}"></a>`;
    const p = missingAlt.fixFile("sections/header.liquid", own, {})!;
    expect(p.after).toContain(`<img alt="{{ settings.logo.alt | default: shop.name | escape }}" src="{{ settings.logo`);
    expect(p.after.match(/alt="\{\{ shop\.name \| escape \}\}"/g)).toHaveLength(2);
    expect(review(p.notes)).toEqual([]);
  });

  it("sends other brands' logos to review", () => {
    for (const src of [
      `<img class="press-logo" src="{{ 'vogue.png' | asset_url }}">`,
      `<img src="{{ 'payment-logos.png' | asset_url }}">`,
      `<img class="logo-list__image" src="{{ 'partner.png' | asset_url }}">`,
      `<a href="{{ block.settings.link }}" class="logo-list__link"><img src="{{ 'x.png' | asset_url }}"></a>`,
    ]) {
      const p = missingAlt.fixFile("sections/x.liquid", src, {})!;
      expect(p.after, src).toBe(src);
      expect(review(p.notes), src).toHaveLength(1);
    }
    const link = `<a href="{{ block.settings.link }}" class="logo-list__link"><img src="{{ 'x.png' | asset_url }}" alt=""></a>`;
    const l = emptyLink.fixFile("sections/logo-list.liquid", link, {})!;
    expect(l.after).toBe(link);
    expect(review(l.notes)).toHaveLength(1);
  });

  it("names the home link from shop-logo clues", () => {
    const src = `<a href="{{ routes.root_url }}" class="header__heading-link"><img src="{{ settings.logo | image_url }}" alt=""></a>`;
    const p = emptyLink.fixFile("sections/header.liquid", src, {})!;
    expect(p.after).toContain(`<a aria-label="{{ shop.name | escape }}" href="{{ routes.root_url }}"`);
  });
});

describe("close buttons (review 8)", () => {
  it("does not read Alpine's x-on as a close icon", () => {
    const src = `<button type="button" x-on:click="open = !open">{% render 'icon-chevron-down' %}</button>`;
    const p = emptyButton.fixFile("snippets/x.liquid", src, {})!;
    expect(p.after).toBe(src);
    expect(review(p.notes)).toHaveLength(1);
    const x = emptyButton.fixFile("snippets/x.liquid", `<button type="button">{% render 'icon-x' %}</button>`, {})!;
    expect(x.after).toContain('aria-label="Close"');
  });
});

describe("translation keys that need a variable (review 10)", () => {
  it("skips keys whose value holds {{ }} and falls back to English", () => {
    // Values from Dawn 16 locales/en.default.json.
    const locale = {
      products: { product: { quantity: { increase: "Increase quantity for {{ product }}", decrease: "Decrease quantity for {{ product }}" }, media: { open_media: "Open media {{ index }} in modal" } } },
      sections: { video: { load_video: "Load video: {{ description }}" } },
    };
    const src = `<button name="plus" type="button">{% render 'icon-plus' %}</button>
<button class="deferred-media__poster-button" type="button">{% render 'icon-play' %}</button>
<button class="product__media-zoom" type="button">{% render 'icon-zoom' %}</button>`;
    const p = emptyButton.fixFile("snippets/x.liquid", src, { locale })!;
    expect(p.after).not.toContain("| t");
    expect(p.after).toContain('aria-label="Increase quantity"');
    expect(p.after).toContain('aria-label="Play"');
    expect(p.after).toContain('aria-label="Zoom"');
  });
});
