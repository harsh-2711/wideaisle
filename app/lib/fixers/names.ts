// Works out an accessible name for an icon-only link or button from the
// clues around it: icon names, classes, ids, hrefs and form field names.
// Prefers the theme's own translation keys, so multilingual stores stay
// translated; falls back to plain English.

export interface NameRule {
  role: string;
  match: RegExp;
  english: string;
  // Translation keys to try, first match wins (Dawn's keys first).
  keys: string[];
  // A Liquid expression to use instead of a translation, for example the shop name.
  liquid?: string;
}

const SOCIAL: [string, string][] = [
  ["facebook", "Facebook"], ["instagram", "Instagram"], ["twitter", "X (Twitter)"], ["tiktok", "TikTok"],
  ["youtube", "YouTube"], ["pinterest", "Pinterest"], ["snapchat", "Snapchat"], ["tumblr", "Tumblr"],
  ["vimeo", "Vimeo"], ["linkedin", "LinkedIn"], ["threads", "Threads"],
];

// Order matters: specific clues first.
export const LINK_RULES: NameRule[] = [
  ...SOCIAL.map(([k, name]) => ({ role: `social-${k}`, match: new RegExp(`\\b(icon-)?${k}\\b`, "i"), english: name, keys: [`general.social.links.${k}`] })),
  // Clues are icon names and destinations, not loose class words, so a
  // product link inside the cart (class "cart-item__link") is not a cart link.
  { role: "cart", match: /icon-(cart|bag|basket)\b|routes\.cart_url|href=["']\/cart["'/?]|\b(header__icon--cart|cart-icon|site-header__cart)\b/i, english: "Cart", keys: ["templates.cart.cart", "sections.header.cart", "general.cart.title"] },
  { role: "account", match: /icon-(account|user|customer)\b|routes\.account(_login)?_url|href=["']\/account|\b(header__icon--account|account-icon)\b/i, english: "Account", keys: ["customer.account_fallback", "customer.account.title", "customer.log_in"] },
  { role: "search", match: /icon-search\b|routes\.search_url|href=["']\/search|\b(header__icon--search|search-icon)\b/i, english: "Search", keys: ["general.search.search", "templates.search.title"] },
  { role: "wishlist", match: /\b(icon-)?(wishlist|heart)\b/i, english: "Wishlist", keys: [] },
  { role: "home", match: /\b(logo|header__heading-link)\b|routes\.root_url|href=["']\/["']/i, english: "Home", keys: [], liquid: "{{ shop.name | escape }}" },
];

export const BUTTON_RULES: NameRule[] = [
  { role: "close", match: /\b(icon-)?(close|x|dismiss)\b|__close\b|close-button/i, english: "Close", keys: ["accessibility.close", "general.close"] },
  { role: "menu", match: /\b(icon-)?(hamburger|menu|burger)\b|menu-drawer|nav-toggle/i, english: "Menu", keys: ["sections.header.menu", "general.menu"] },
  { role: "search", match: /\b(icon-)?search\b/i, english: "Search", keys: ["general.search.search"] },
  { role: "increase", match: /\b(icon-)?(plus|increase|increment)\b|name=["']plus["']/i, english: "Increase quantity", keys: ["products.product.quantity.increase"] },
  { role: "decrease", match: /\b(icon-)?(minus|decrease|decrement)\b|name=["']minus["']/i, english: "Decrease quantity", keys: ["products.product.quantity.decrease"] },
  { role: "previous", match: /\b(icon-)?(prev|previous|arrow-left|caret-left|chevron-left)\b|slider-button--prev/i, english: "Previous slide", keys: ["general.slider.previous_slide"] },
  { role: "next", match: /\b(icon-)?(next|arrow-right|caret-right|chevron-right)\b|slider-button--next/i, english: "Next slide", keys: ["general.slider.next_slide"] },
  { role: "play", match: /\b(icon-)?play\b/i, english: "Play", keys: ["sections.video.load_video", "general.slider.play"] },
  { role: "pause", match: /\b(icon-)?pause\b/i, english: "Pause", keys: ["sections.slideshow.pause_slideshow", "general.slider.pause"] },
  { role: "share", match: /\b(icon-)?share\b/i, english: "Share", keys: ["general.share.share"] },
  { role: "zoom", match: /\b(icon-)?(zoom|expand|enlarge)\b/i, english: "Zoom", keys: ["products.product.media.open_media"] },
  { role: "info", match: /icon-info\b|info-button/i, english: "More information", keys: [] },
  { role: "remove", match: /\b(icon-)?(remove|delete|trash)\b/i, english: "Remove", keys: ["sections.cart.remove", "templates.cart.remove"] },
];

export const FIELD_RULES: NameRule[] = [
  { role: "search", match: /type=["']search["']|name=["']q["']|search/i, english: "Search", keys: ["general.search.search"] },
  { role: "email", match: /type=["']email["']|email/i, english: "Email", keys: ["newsletter.label", "templates.contact.form.email"] },
  { role: "quantity", match: /name=["']quantity|updates\[|quantity/i, english: "Quantity", keys: ["products.product.quantity.label"] },
  { role: "phone", match: /type=["']tel["']|phone/i, english: "Phone number", keys: ["templates.contact.form.phone"] },
  { role: "name", match: /contact\[name\]|name=["']name["']|first_name|last_name/i, english: "Name", keys: ["templates.contact.form.name"] },
  { role: "message", match: /contact\[body\]|message|comment/i, english: "Message", keys: ["templates.contact.form.comment"] },
  { role: "password", match: /type=["']password["']|password/i, english: "Password", keys: ["customer.login_page.password", "general.password_page.login_form_password_label"] },
  { role: "note", match: /name=["']note["']|cart\[note\]/i, english: "Order note", keys: ["sections.cart.note"] },
];

function lookup(locale: Record<string, unknown> | undefined, key: string): string | null {
  if (!locale) return null;
  let cur: unknown = locale;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return null;
  }
  return typeof cur === "string" ? cur : null;
}

export interface Name {
  role: string;
  // The attribute value to write, Liquid allowed.
  value: string;
  // Where it came from, for the remediation log.
  source: string;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function inferName(clues: string, rules: NameRule[], locale?: Record<string, unknown>): Name | null {
  for (const rule of rules) {
    if (!rule.match.test(clues)) continue;
    if (rule.liquid) return { role: rule.role, value: rule.liquid, source: "shop name" };
    for (const key of rule.keys) {
      if (lookup(locale, key)) return { role: rule.role, value: `{{ '${key}' | t }}`, source: `translation ${key}` };
    }
    return { role: rule.role, value: escapeAttr(rule.english), source: "English default (no translation key in theme)" };
  }
  return null;
}
