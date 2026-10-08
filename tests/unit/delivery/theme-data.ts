// Test data for the delivery adapters: a tiny Dawn-like theme and a patch
// shaped like the fixer engine's output. The recorded fixtures under
// tests/fixtures/ hold these same strings, so keep them in step.
import type { DeliveryPatch } from "../../../app/lib/delivery/types";

export const HEADER_BEFORE = `<a href="{{ routes.cart_url }}" class="header__icon">{% render 'icon-cart' %}</a>\n`;
export const HEADER_AFTER = `<a href="{{ routes.cart_url }}" class="header__icon" aria-label="{{ 'templates.cart.cart' | t }}">{% render 'icon-cart' %}</a>\n`;
export const CSS_BEFORE = `.button { color: #999999; background: #ffffff; }\r\n`;
export const CSS_AFTER = `.button { color: #595959; background: #ffffff; }\r\n`;
export const NEW_SNIPPET = `{%- comment -%} Added by Wide Aisle {%- endcomment -%}\n<span class="visually-hidden">{{ label }}</span>\n`;

// A few bytes that are not valid UTF-8, to prove binary files pass through.
export const LOGO_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80]);

export const THEME_TEXT: Record<string, string> = {
  "layout/theme.liquid": `<!doctype html>\n<html lang="{{ request.locale.iso_code }}">\n<head>{{ content_for_header }}</head>\n<body>{{ content_for_layout }}</body>\n</html>\n`,
  "sections/header.liquid": HEADER_BEFORE,
  "assets/base.css": CSS_BEFORE,
  "config/settings_data.json": `{\n  "current": "Default"\n}\n`,
  "locales/en.default.json": `{ "templates": { "cart": { "cart": "Cart" } } }\n`,
};

export const PRODUCT_ID = "gid://shopify/Product/4444444444";
export const MEDIA_ID = "gid://shopify/MediaImage/3333333333";
export const ALT_AFTER = "Red canvas sneaker, side view";

export function samplePatch(overrides: Partial<DeliveryPatch> = {}): DeliveryPatch {
  return {
    id: "p-001",
    title: "Name the cart link and raise button contrast",
    files: [
      { file: "sections/header.liquid", before: HEADER_BEFORE, after: HEADER_AFTER },
      { file: "assets/base.css", before: CSS_BEFORE, after: CSS_AFTER },
      { file: "snippets/wa-visually-hidden.liquid", before: null, after: NEW_SNIPPET },
    ],
    altText: [],
    ...overrides,
  };
}
