// Regressions from the PR #35 review. Each test failed before its fix.
import { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";
import { attrSafe, emptyButton, emptyLink, missingLabel } from "../../app/lib/fixers/fixers";
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
