// Seeded, Shopify-like store pages for the scan benchmark (T-033).
//
// Each store has a home, a collection, a product and a cart page, built from
// Dawn-like markup: a mega menu, product cards with srcsets, facets, a
// product gallery with variants, a footer with payment icons. Each page loads
// a theme stylesheet, theme and vendor scripts, a storefront script and a few
// app scripts that inject widgets. The scripts run real (generated) code, so
// the browser parses, compiles and executes about as much as on a live store.
// Stores also carry a seeded mix of the six v1 failure types, so axe-core has
// violations to report.
//
// The same seed always gives the same bytes. Nothing is fetched from the
// network.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// Bump when the output changes, so cached fixtures are rebuilt.
export const FIXTURE_VERSION = 1;

export const PAGE_KINDS = ["home", "collection", "product", "cart"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

// Every store is served on its own host name, which the benchmark resolves
// to the local fixture server.
export const HOST_SUFFIX = "bench.test";
export function storeHost(index: number): string {
  return `s${index}.${HOST_SUFFIX}`;
}

// ---------- random ----------

export type Rand = () => number;

// mulberry32: small, fast and the same on every platform.
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Gen {
  constructor(readonly r: Rand) {}
  int(min: number, max: number): number {
    return min + Math.floor(this.r() * (max - min + 1));
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.r() * xs.length)];
  }
  chance(p: number): boolean {
    return this.r() < p;
  }
  words(n: number): string {
    return Array.from({ length: n }, () => this.pick(LOREM)).join(" ");
  }
  sentence(min = 6, max = 16): string {
    const s = this.words(this.int(min, max));
    return s[0].toUpperCase() + s.slice(1) + ".";
  }
  hex(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += "0123456789abcdef"[this.int(0, 15)];
    return s;
  }
}

const LOREM =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum soft cotton linen washed relaxed fit everyday made small batches recycled materials ships free returns".split(
    " ",
  );
const ADJ = ["Linen", "Cotton", "Wool", "Classic", "Everyday", "Organic", "Vintage", "Coastal", "Urban", "Alpine", "Soft", "Bold", "Daily", "Weekend", "Studio", "Field", "Harbor", "Canyon", "Meadow", "Summit"];
const NOUN = ["Shirt", "Tee", "Hoodie", "Jacket", "Tote", "Mug", "Candle", "Notebook", "Cap", "Scarf", "Sneaker", "Backpack", "Bottle", "Blanket", "Planter", "Apron", "Wallet", "Belt", "Sock", "Lamp"];
const STORE_NOUN = ["Goods", "Supply", "Studio", "Market", "Outfitters", "House", "Collective", "Works", "Trading", "Mercantile"];
const COLORS = ["Black", "White", "Navy", "Olive", "Sand", "Rust", "Stone", "Sky", "Forest", "Clay"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const THEMES: [string, number, string][] = [
  ["Dawn", 887, "15.2.0"],
  ["Refresh", 1567, "15.1.0"],
  ["Sense", 1356, "15.0.1"],
  ["Craft", 1368, "15.0.0"],
  ["Prestige", 855, "10.3.0"],
  ["Impulse", 857, "7.6.1"],
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- store model ----------

interface Product {
  handle: string;
  title: string;
  vendor: string;
  price: number;
  compareAt: number | null;
  id: number;
}

export interface StoreSpec {
  index: number;
  host: string;
  name: string;
  theme: { name: string; id: number; version: string };
  lang: boolean;
  apps: { reviews: boolean; chat: boolean; popup: boolean; upsell: boolean };
  // Seeded failure mix: the share of each pattern that is broken.
  faults: {
    lowContrastPrices: boolean;
    lowContrastBadges: boolean;
    cardAltMissing: number;
    iconLinksUnnamed: boolean;
    socialLinksUnnamed: boolean;
    sliderButtonsUnnamed: boolean;
    newsletterUnlabelled: boolean;
    chatButtonUnnamed: boolean;
    wishlistButtonsUnnamed: boolean;
  };
  sizes: {
    menuItems: number;
    homeSections: number;
    cardsPerSection: number;
    collectionCards: number;
    facetGroups: number;
    productMedia: number;
    variants: number;
    descParagraphs: number;
    reviews: number;
    cartItems: number;
    footerColumns: number;
    themeCssKb: number;
    themeJsKb: number;
    vendorJsKb: number;
    storefrontJsKb: number;
    appJsKb: number;
  };
  collections: string[];
  products: Product[];
}

export function storeSpec(seed: number, index: number): StoreSpec {
  // Mix the store index into the seed so stores differ but stay stable.
  const g = new Gen(mulberry32((seed * 2654435761 + index * 40503) >>> 0));
  const [themeName, themeId, themeVersion] = g.pick(THEMES);
  const sizes = {
    menuItems: g.int(5, 9),
    homeSections: g.int(4, 8),
    cardsPerSection: g.pick([4, 6, 8, 8, 12]),
    collectionCards: g.pick([16, 24, 24, 36, 48]),
    facetGroups: g.int(3, 7),
    productMedia: g.int(3, 9),
    variants: g.int(2, 40),
    descParagraphs: g.int(3, 12),
    reviews: g.int(4, 20),
    cartItems: g.int(1, 5),
    footerColumns: g.int(3, 5),
    themeCssKb: g.int(70, 180),
    themeJsKb: g.int(40, 120),
    vendorJsKb: g.int(40, 520),
    storefrontJsKb: g.int(40, 110),
    appJsKb: g.int(20, 90),
  };
  const collections = Array.from({ length: g.int(6, 14) }, () => slug(`${g.pick(ADJ)} ${g.pick(NOUN)}s`) + "-" + g.int(1, 99));
  const vendor = `${g.pick(ADJ)} ${g.pick(STORE_NOUN)}`;
  const products: Product[] = Array.from({ length: 60 }, (_, i) => {
    const title = `${g.pick(ADJ)} ${g.pick(COLORS)} ${g.pick(NOUN)}`;
    const price = g.int(8, 240) * 100 + g.pick([0, 0, 50, 95, 99]);
    return {
      handle: `${slug(title)}-${i}`,
      title,
      vendor,
      price,
      compareAt: g.chance(0.3) ? price + g.int(5, 60) * 100 : null,
      id: 7000000000000 + index * 1000 + i,
    };
  });
  return {
    index,
    host: storeHost(index),
    name: vendor,
    theme: { name: themeName, id: themeId, version: themeVersion },
    lang: !g.chance(0.04),
    apps: { reviews: g.chance(0.6), chat: g.chance(0.4), popup: g.chance(0.5), upsell: g.chance(0.35) },
    faults: {
      lowContrastPrices: g.chance(0.55),
      lowContrastBadges: g.chance(0.5),
      cardAltMissing: g.pick([0, 0, 0.1, 0.3, 0.6]),
      iconLinksUnnamed: g.chance(0.45),
      socialLinksUnnamed: g.chance(0.5),
      sliderButtonsUnnamed: g.chance(0.4),
      newsletterUnlabelled: g.chance(0.5),
      chatButtonUnnamed: g.chance(0.6),
      wishlistButtonsUnnamed: g.chance(0.3),
    },
    sizes,
    collections,
    products,
  };
}

// ---------- svg ----------

function svgPath(g: Gen, segments: number): string {
  let d = `M${g.int(0, 20)}.${g.int(0, 9)} ${g.int(0, 20)}.${g.int(0, 9)}`;
  for (let i = 0; i < segments; i++) {
    d += g.chance(0.5)
      ? `L${g.int(0, 20)}.${g.int(10, 99)} ${g.int(0, 20)}.${g.int(10, 99)}`
      : `C${g.int(0, 20)}.${g.int(1, 9)} ${g.int(0, 20)}.${g.int(1, 9)} ${g.int(0, 20)}.${g.int(1, 9)} ${g.int(0, 20)}.${g.int(1, 9)} ${g.int(0, 20)}.${g.int(1, 9)} ${g.int(0, 20)}.${g.int(1, 9)}`;
  }
  return d + "Z";
}

function icon(g: Gen, name: string, segments = 12): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" class="icon icon-${name}" fill="none" viewBox="0 0 20 20"><path fill="currentColor" fill-rule="evenodd" d="${svgPath(g, segments)}" clip-rule="evenodd"/></svg>`;
}

function paymentIcon(g: Gen, name: string): string {
  const paths = Array.from({ length: g.int(2, 5) }, () => `<path fill="#${g.hex(6)}" d="${svgPath(g, g.int(10, 40))}"/>`).join("");
  return `<li class="list-payment__item"><svg class="icon icon--full-color" viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg" role="img" width="38" height="24" aria-labelledby="pi-${name}"><title id="pi-${name}">${name}</title><path opacity=".07" d="M35 0H3C1.3 0 0 1.3 0 3v18c0 1.7 1.4 3 3 3h32c1.7 0 3-1.3 3-3V3c0-1.7-1.4-3-3-3z"/>${paths}</svg></li>`;
}

// ---------- css ----------

function themeCss(g: Gen, s: StoreSpec): string {
  const fg = "18, 18, 18";
  const priceColor = s.faults.lowContrastPrices ? "rgba(18, 18, 18, 0.45)" : "rgba(18, 18, 18, 0.85)";
  const badgeBg = s.faults.lowContrastBadges ? "#f28b82" : "#b3261e";
  const head = `/* ${s.theme.name} ${s.theme.version} base.css (benchmark fixture) */
:root{--color-foreground:${fg};--color-background:255, 255, 255;--color-button:18, 18, 18;--color-button-text:255, 255, 255;--color-link:${fg};--color-badge-foreground:${fg};--page-width:120rem;--spacing-sections-desktop:0px;--spacing-sections-mobile:0px;--grid-desktop-vertical-spacing:8px;--grid-desktop-horizontal-spacing:8px;--grid-mobile-vertical-spacing:4px;--grid-mobile-horizontal-spacing:4px;--font-body-family:Assistant, sans-serif;--font-heading-family:Assistant, sans-serif;--font-body-scale:1;--font-heading-scale:1;--duration-short:100ms;--duration-default:200ms;--duration-long:500ms;--buttons-radius:0px;--inputs-radius:0px;--card-corner-radius:0rem;--media-padding:0px}
*,*::before,*::after{box-sizing:inherit}html{box-sizing:border-box;font-size:calc(var(--font-body-scale) * 62.5%);height:100%}
body{display:grid;grid-template-rows:auto auto 1fr auto;grid-template-columns:100%;min-height:100%;margin:0;font-size:1.5rem;letter-spacing:0.06rem;line-height:calc(1 + 0.8 / var(--font-body-scale));font-family:var(--font-body-family);color:rgb(var(--color-foreground));background:rgb(var(--color-background))}
.page-width{max-width:var(--page-width);margin:0 auto;padding:0 1.5rem}
.visually-hidden{position:absolute!important;overflow:hidden;width:1px;height:1px;margin:-1px;padding:0;border:0;clip:rect(0 0 0 0);word-wrap:normal!important}
.skip-to-content-link:focus{z-index:9999;position:inherit;overflow:auto;width:auto;height:auto;clip:auto}
.announcement-bar{border-bottom:0.1rem solid rgba(${fg}, 0.08);background:#121212;color:#fff}.announcement-bar__message{text-align:center;padding:1rem 0;margin:0;letter-spacing:0.1rem;font-size:1.2rem}
.header{display:grid;grid-template-areas:"left-icons heading icons";grid-template-columns:1fr 2fr 1fr;align-items:center;padding:2rem 3rem}
.header__heading-link{display:inline-block;padding:0.75rem;text-decoration:none;word-break:break-word}.header__heading-logo{height:auto;max-width:100%}
.header__inline-menu{margin-left:-1.2rem;grid-area:navigation;display:none}@media screen and (min-width:990px){.header__inline-menu{display:block}}
.list-menu{list-style:none;padding:0;margin:0}.list-menu--inline{display:inline-flex;flex-wrap:wrap}.list-menu__item{display:flex;align-items:center;line-height:calc(1 + 0.3 / var(--font-body-scale))}
.header__menu-item{padding:1.2rem;text-decoration:none;color:rgba(${fg}, 0.75)}.header__menu-item:hover{color:rgb(${fg})}
.header__submenu{transition:opacity var(--duration-default) ease,transform var(--duration-default) ease}.header__icons{display:flex;grid-area:icons;justify-self:end;padding-right:0.8rem}
.header__icon{color:rgb(${fg});height:4.4rem;width:4.4rem;padding:0;display:flex;align-items:center;justify-content:center}.icon{height:2rem;width:2rem}
.grid{display:flex;flex-wrap:wrap;margin-bottom:2rem;padding:0;list-style:none;column-gap:var(--grid-mobile-horizontal-spacing);row-gap:var(--grid-mobile-vertical-spacing)}
.grid__item{width:calc(25% - var(--grid-desktop-horizontal-spacing) * 3 / 4);max-width:50%;flex-grow:1;flex-shrink:0}
@media screen and (max-width:749px){.grid--2-col-tablet-down .grid__item{width:calc(50% - var(--grid-mobile-horizontal-spacing) / 2)}}
.card-wrapper{color:inherit;height:100%;position:relative;text-decoration:none}.card{text-decoration:none;text-align:var(--text-alignment);display:flex;flex-direction:column;height:100%;position:relative}
.card__inner{width:100%}.card__media{margin:var(--media-padding);z-index:0;border-radius:calc(var(--card-corner-radius) - var(--border-width) - var(--image-padding))}
.media{display:block;background-color:rgba(${fg}, 0.1);position:relative;overflow:hidden}.media>img{object-fit:cover;object-position:center center;transition:opacity 0.4s cubic-bezier(0.25,0.46,0.45,0.94)}
.ratio{display:flex;position:relative;align-items:stretch}.ratio:before{content:"";width:0;height:0;padding-bottom:var(--ratio-percent)}
.card__content{display:grid;grid-template-rows:minmax(0,1fr) max-content minmax(0,1fr);padding:1rem;width:100%;flex-grow:1}
.card__heading{margin-top:0;margin-bottom:0}.card__heading a{color:rgb(${fg});text-decoration:none}.full-unstyled-link{text-decoration:none;color:currentColor;display:block}
.card-information{text-align:var(--text-alignment)}.caption-large{font-size:1.3rem;line-height:calc(1 + 0.5 / var(--font-body-scale));letter-spacing:0.04rem}
.price{font-size:1.6rem;letter-spacing:0.1rem;line-height:calc(1 + 0.5 / var(--font-body-scale));color:rgb(${fg})}.price-item{display:inline-block;margin:0 1rem 0 0}
.price-item--regular{color:${priceColor}}.price__sale{display:none}.price--on-sale .price__sale{display:initial;flex-direction:row;flex-wrap:wrap}.price--on-sale .price__regular{display:none}
.price--on-sale .price-item--regular{text-decoration:line-through;color:${priceColor};font-size:1.3rem}.unit-price{display:block;font-size:1.1rem;margin-top:0.2rem;text-transform:uppercase;color:rgba(${fg}, 0.7)}
.badge{border:1px solid transparent;border-radius:4rem;display:inline-block;font-size:1.2rem;letter-spacing:0.1rem;line-height:1;padding:0.5rem 1.3rem 0.6rem 1.3rem;text-align:center;background-color:${badgeBg};color:#fff;word-break:break-word}
.button{display:inline-flex;justify-content:center;align-items:center;border:0;padding:0 3rem;cursor:pointer;font:inherit;font-size:1.5rem;text-decoration:none;color:rgb(var(--color-button-text));background-color:rgb(var(--color-button));min-width:12rem;min-height:4.5rem}
.button--secondary{color:rgb(${fg});background-color:#fff;box-shadow:0 0 0 0.1rem rgb(${fg})}.button--full-width{display:flex;width:100%}
.field{position:relative;width:100%;display:flex}.field__input{flex-grow:1;text-align:left;padding:1.5rem;margin:0;border:0;border-radius:var(--inputs-radius);height:4.5rem;min-height:calc(var(--inputs-border-width) * 2);box-shadow:0 0 0 0.1rem rgba(${fg}, 0.55)}
.field__label{font-size:1.6rem;left:1.5rem;top:1rem;margin-bottom:0;pointer-events:none;position:absolute;transition:top var(--duration-short) ease,font-size var(--duration-short) ease;color:rgba(${fg}, 0.75)}
.footer{border-top:0.1rem solid rgba(${fg}, 0.08);padding:4rem 0}.footer-block__heading{margin-bottom:2rem;margin-top:0;font-size:1.6rem}.footer-block__details-content .list-menu__item--link{text-decoration:none;color:rgba(${fg}, 0.75);padding:0.5rem 0}
.list-social{display:flex;flex-wrap:wrap;justify-content:flex-start;list-style:none;padding:0}.list-social__link{align-items:center;display:flex;padding:1.1rem;color:rgb(${fg})}
.list-payment{display:flex;flex-wrap:wrap;justify-content:center;margin:-0.5rem 0;padding:0;list-style:none}.list-payment__item{align-items:center;display:flex;padding:0.5rem}
.copyright__content{font-size:1.1rem;color:${s.faults.lowContrastPrices ? "#aaaaaa" : "#595959"}}
.facets__form{display:grid;gap:0 3.5rem;grid-template-columns:auto 1fr auto}.facets__summary{color:rgba(${fg}, 0.75);font-size:1.4rem;padding:0 1.75rem 0 0;margin-bottom:1.5rem}
.facet-checkbox{padding:1rem 2rem 1rem 0;flex-grow:1;position:relative;font-size:1.4rem;display:flex;word-break:break-word}.facet-checkbox input[type=checkbox]{position:absolute;opacity:1;width:1.6rem;height:1.6rem;top:0.7rem;left:-0.4rem;z-index:-1;appearance:none}
.product{margin:0}.product__media-list{display:flex;flex-wrap:wrap;list-style:none;padding:0}.product__media-item{width:calc(50% - 0.5rem)}.product__title h1{margin:0;font-size:3rem}
.product-form__input{flex:0 0 100%;padding:0;margin:0 0 1.2rem 0;max-width:44rem;min-width:fit-content;border:none}.product-form__input input[type=radio]{clip:rect(0,0,0,0);overflow:hidden;position:absolute;height:1px;width:1px}
.product-form__input input[type=radio]+label{border:0.1rem solid rgba(${fg}, 0.55);background-color:#fff;color:rgb(${fg});border-radius:4rem;display:inline-block;margin:0.7rem 0.5rem 0.2rem 0;padding:1rem 2rem;font-size:1.4rem}
.quantity{border:0.1rem solid rgba(${fg}, 0.55);position:relative;width:14rem;display:flex;min-height:4.5rem}.quantity__input{color:currentColor;font-size:1.4rem;font-weight:500;opacity:0.85;text-align:center;background-color:transparent;border:0;padding:0 0.5rem;width:100%;flex-grow:1}
.quantity__button{width:4.5rem;flex-shrink:0;font-size:1.8rem;border:0;background-color:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgb(${fg});padding:0}
.product__accordion summary{padding:1.5rem 0;cursor:pointer}.rte p{margin:0 0 1.5rem}.slider-button{color:rgba(${fg}, 0.75);background:transparent;border:none;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center}
.cart-items{border-spacing:0;border-collapse:separate;box-shadow:none;width:100%;display:block}.cart-item{display:grid;grid-template:repeat(2,auto) / repeat(4,1fr);gap:1.5rem;margin-bottom:3.5rem}
.cart-item__name{text-decoration:none;display:block;font-size:1.6rem}.cart-item__details{font-size:1.6rem;line-height:calc(1 + 0.4 / var(--font-body-scale))}.cart__note{height:fit-content}.cart__ctas{display:flex;gap:1rem}
.totals{display:flex;justify-content:center;align-items:flex-end}.totals>*{font-size:1.6rem;margin:0}.tax-note{margin:2.2rem 0 1.6rem auto;text-align:center;display:block;color:${s.faults.lowContrastPrices ? "#9e9e9e" : "#595959"}}
.newsletter-form{display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;position:relative}.newsletter-form__field-wrapper{max-width:36rem}
`;
  // Filler: component rules, most of which match nothing on a given page, as
  // on a real theme.
  const parts = [head];
  let size = head.length;
  const target = s.sizes.themeCssKb * 1024;
  let k = 0;
  while (size < target) {
    const name = `${g.pick(LOREM)}-${g.pick(NOUN).toLowerCase()}-${k++}`;
    const block = [
      `.${name}{display:${g.pick(["flex", "grid", "block", "inline-flex"])};gap:${g.int(0, 4)}rem;padding:${g.int(0, 6)}rem ${g.int(0, 6)}rem;color:rgba(var(--color-foreground), ${g.int(5, 10) / 10});background:rgb(var(--color-background));border-radius:var(--buttons-radius)}`,
      `.${name}__item>.${name}__link:hover,.${name}__item>.${name}__link:focus-visible{text-decoration:underline;text-underline-offset:0.3rem;outline:0.2rem solid rgba(var(--color-foreground), 0.5);outline-offset:0.3rem}`,
      `.${name}--${g.pick(["small", "medium", "large"])} .${name}__media img{object-fit:cover;width:100%;height:${g.int(10, 60)}rem;transition:transform var(--duration-long) ease}`,
      `@media screen and (min-width:${g.pick([750, 990, 1200])}px){.${name}{grid-template-columns:repeat(${g.int(2, 6)},minmax(0,1fr));column-gap:${g.int(1, 4)}rem}.${name}__heading{font-size:calc(var(--font-heading-scale) * ${g.int(16, 48) / 10}rem)}}`,
      `.${name}[aria-expanded=true] .${name}__icon,.${name} details[open]>summary .${name}__caret{transform:rotate(${g.pick([90, 180, 270])}deg)}`,
    ].join("\n");
    parts.push(block);
    size += block.length + 1;
  }
  return parts.join("\n");
}

function sectionCss(g: Gen, name: string, kb: number): string {
  const parts = [`/* section-${name}.css (benchmark fixture) */`];
  let size = 0;
  let k = 0;
  while (size < kb * 1024) {
    const sel = `.${name}__${g.pick(LOREM)}-${k++}`;
    const rule = `${sel}{margin:${g.int(0, 4)}rem 0;font-size:${g.int(12, 24) / 10}rem;line-height:${g.int(10, 18) / 10};letter-spacing:0.0${g.int(1, 9)}rem}@media screen and (min-width:750px){${sel}{margin:${g.int(0, 6)}rem 0}}`;
    parts.push(rule);
    size += rule.length + 1;
  }
  return parts.join("\n");
}

// ---------- js ----------

type FnKind = "hash" | "money" | "array" | "dom" | "object" | "other";

function jsFunction(g: Gen, i: number): { code: string; kind: FnKind } {
  switch (g.int(0, 7)) {
    case 0:
      return {
        kind: "hash",
        code: `M.f${i}=function(a){var s=${g.int(1, 99999)}|0,t=String(a);for(var k=0;k<t.length;k++){s=Math.imul(s^t.charCodeAt(k),${g.pick([16777619, 2654435761, 40503, 31])})>>>0;}return s.toString(36);};`,
      };
    case 1:
      return {
        kind: "money",
        code: `M.f${i}=function(c,f){c=(Number(c)||0)/100;var p=c.toFixed(2).split(".");return (f||"${g.pick(["$", "€", "£"])}")+p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,",")+"."+p[1];};`,
      };
    case 2:
      return {
        kind: "array",
        code: `M.f${i}=function(xs){return (xs||[]).filter(function(x){return x%${g.int(2, 7)}!==0;}).map(function(x){return x*${g.int(2, 9)}+${g.int(0, 99)};}).reduce(function(a,b){return a+b;},0);};`,
      };
    case 3:
      return {
        kind: "dom",
        code: `M.f${i}=function(root){var els=(root||document).querySelectorAll("${g.pick([".card-wrapper", ".price", ".list-menu__item", ".grid__item", "a", "button", ".shopify-section", "img", "li", "h3"])}");for(var k=0;k<els.length;k++){els[k].setAttribute("data-${g.pick(LOREM)}-${i}",String(k));}return els.length;};`,
      };
    case 4:
      return {
        kind: "object",
        code: `M.f${i}=function(o){var r={};for(var k in o){if(Object.prototype.hasOwnProperty.call(o,k)){r["${g.pick(LOREM)}_"+k]=typeof o[k]==="string"?o[k].trim():o[k];}}return r;};`,
      };
    case 5:
      return {
        kind: "other",
        code: `M.f${i}=function(fn,w){var t;return function(){var a=arguments,c=this;clearTimeout(t);t=setTimeout(function(){fn.apply(c,a);},w||${g.int(50, 500)});};};`,
      };
    case 6: {
      const table: Record<string, string> = {};
      for (let k = 0; k < g.int(8, 30); k++) table[`${g.pick(LOREM)}_${g.pick(LOREM)}_${k}`] = g.sentence(3, 10);
      return { kind: "other", code: `M.s${i}=${JSON.stringify(table)};M.f${i}=function(k){return M.s${i}[k]||k;};` };
    }
    default:
      return {
        kind: "other",
        code: `M.C${i}=function(el){this.el=el;this.state={open:false,n:${g.int(0, 99)}};};M.C${i}.prototype.toggle=function(){this.state.open=!this.state.open;if(this.el){this.el.classList.toggle("is-open-${i}",this.state.open);}return this.state.open;};M.f${i}=function(el){return new M.C${i}(el).toggle();};`,
      };
  }
}

// A script of about `kb` kilobytes: generated helpers, then `init`, which
// runs once the DOM is ready and calls a sample of the helpers on real nodes.
function jsBundle(g: Gen, name: string, kb: number, init: string): string {
  const fns: { code: string; kind: FnKind }[] = [];
  let size = 0;
  while (size < kb * 1024) {
    const f = jsFunction(g, fns.length);
    fns.push(f);
    size += f.code.length + 1;
  }
  const idx = (kind: FnKind) => fns.map((f, i) => (f.kind === kind ? i : -1)).filter((i) => i >= 0);
  const sample = (xs: number[], n: number) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0).slice(0, n);
  const calls = `var H=${JSON.stringify(sample(idx("hash"), 30))},P=${JSON.stringify(sample(idx("money"), 20))},A=${JSON.stringify(sample(idx("array"), 20))},D=${JSON.stringify(sample(idx("dom"), 8))},O=${JSON.stringify(sample(idx("object"), 10))};
var texts=[].map.call(document.querySelectorAll("h1,h2,h3,a"),function(e){return e.textContent;}).slice(0,400);
H.forEach(function(i){texts.forEach(function(t){M["f"+i](t);});});
P.forEach(function(i){for(var c=0;c<200;c++){M["f"+i](c*137);}});
A.forEach(function(i){M["f"+i]([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);});
D.forEach(function(i){M["f"+i](document);});
var meta=window.ShopifyAnalytics&&window.ShopifyAnalytics.meta||{};O.forEach(function(i){M["f"+i](meta);});`;
  return `/*! ${name} (benchmark fixture, generated) */
(function(){"use strict";var M={};
${fns.map((f) => f.code).join("\n")}
function run(){
${calls}
${init}
}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",run);}else{run();}
window.${name.replace(/[^a-zA-Z0-9]/g, "_")}=M;
})();
`;
}

// Theme custom elements, as in Dawn: each upgrade queries its children,
// adds listeners and reads layout.
const THEME_INIT = `
class Base extends HTMLElement{connectedCallback(){var self=this;this.buttons=this.querySelectorAll("button,summary,input");for(var i=0;i<this.buttons.length;i++){this.buttons[i].addEventListener("click",function(e){self.dataset.last=e.type;});}this.rect=this.getBoundingClientRect();}}
["header-drawer","header-menu","details-modal","sticky-header","slideshow-component","slider-component","media-gallery","product-info","variant-selects","quantity-input","product-form","share-button","facet-filters-form","checkbox-facet","cart-items","cart-note","cart-remove-button","localization-form","modal-opener","product-recommendations"].forEach(function(n){if(!customElements.get(n)){customElements.define(n,class extends Base{});}});
var secs=document.querySelectorAll(".shopify-section");for(var s=0;s<secs.length;s++){secs[s].getBoundingClientRect();}
var pj=document.getElementById("ProductJson");if(pj){try{var prod=JSON.parse(pj.textContent);window.__product=prod;var opts={};(prod.variants||[]).forEach(function(v){(v.options||[]).forEach(function(o,i){(opts[i]=opts[i]||{})[o]=true;});});}catch(e){}}
var slides=document.querySelectorAll(".slideshow__slide");if(slides.length>1){var cur=0;setInterval(function(){slides[cur].setAttribute("aria-hidden","true");cur=(cur+1)%slides.length;slides[cur].setAttribute("aria-hidden","false");},5000);}
`;

function appInit(app: "reviews" | "chat" | "popup" | "upsell", s: StoreSpec, g: Gen): string {
  switch (app) {
    case "reviews": {
      const reviews = Array.from({ length: s.sizes.reviews }, () => ({ a: g.pick(ADJ) + " " + g.pick(LOREM), r: g.int(1, 5), t: g.sentence(8, 40) }));
      return `var R=${JSON.stringify(reviews)};
var host=document.getElementById("judgeme_product_reviews");
if(host){var h='<div class="jdgm-rev-widg"><h2 class="jdgm-rev-widg__title">Customer reviews</h2><div class="jdgm-rev-widg__body">';R.forEach(function(r,i){h+='<div class="jdgm-rev" data-review-id="'+i+'"><div class="jdgm-rev__header"><span class="jdgm-rev__rating" data-score="'+r.r+'"><span class="jdgm-star jdgm--on"></span><span class="jdgm-star jdgm--on"></span><span class="jdgm-star jdgm--off"></span></span><span class="jdgm-rev__author">'+r.a+'</span></div><div class="jdgm-rev__body"><p>'+r.t+'</p></div><div class="jdgm-rev__actions"><button class="jdgm-rev__thumb-btn" type="button">Helpful</button></div></div>';});host.innerHTML=h+'</div></div>';}
[].forEach.call(document.querySelectorAll(".card__information"),function(c,i){var b=document.createElement("div");b.className="jdgm-widget jdgm-preview-badge";b.innerHTML='<div class="jdgm-prev-badge"><span class="jdgm-prev-badge__stars" data-score="4.'+(i%10)+'"><span class="jdgm-star jdgm--on"></span><span class="jdgm-star jdgm--on"></span><span class="jdgm-star jdgm--on"></span><span class="jdgm-star jdgm--on"></span><span class="jdgm-star jdgm--half"></span></span><span class="jdgm-prev-badge__text" style="color:#b0b0b0">'+(i+3)+' reviews</span></div>';c.appendChild(b);});`;
    }
    case "chat":
      return `var w=document.createElement("div");w.id="tidio-chat";w.innerHTML='<div class="tidio-launcher" style="position:fixed;right:20px;bottom:20px"><button type="button" class="tidio-launcher__button" style="width:60px;height:60px;border-radius:30px;background:#0566ff;color:#fff;border:0"${s.faults.chatButtonUnnamed ? "" : ' aria-label="Open chat"'}><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.5 2 2 6 2 11c0 2.4 1 4.6 2.8 6.2L4 22l4.6-2.3c1.1.3 2.2.5 3.4.5 5.5 0 10-4 10-9S17.5 2 12 2z"/></svg></button></div>';document.body.appendChild(w);`;
    case "popup":
      return `var p=document.createElement("div");p.className="klaviyo-form klaviyo-form-${g.hex(6)}";p.innerHTML='<form class="kl-private-reset-css" style="padding:16px;background:#fff8f0"><p style="color:#c9b8a8;font-size:12px">Join our list for 10% off your first order. Unsubscribe any time.</p>${s.faults.newsletterUnlabelled ? '<input type="email" name="email" placeholder="Email address" class="kl-input">' : '<label for="kl-email">Email</label><input id="kl-email" type="email" name="email" class="kl-input">'}<button type="submit" style="background:#222;color:#fff">Subscribe</button></form>';document.body.appendChild(p);`;
    case "upsell":
      return `var u=document.querySelector("main");if(u){var box=document.createElement("div");box.className="rebuy-widget rebuy-recommended-products";var h='<h2 class="rebuy-widget__title">You might also like</h2><ul class="rebuy-product-grid">';for(var i=0;i<6;i++){h+='<li class="rebuy-product-block"><a class="rebuy-product-media" href="/products/item-'+i+'"><img src="/cdn/shop/files/upsell-'+i+'.jpg" width="200" height="200"></a><a class="rebuy-product-title" href="/products/item-'+i+'">Item '+i+'</a><div class="rebuy-money" style="color:#bbbbbb">$'+(10+i)+'.00</div><button class="rebuy-button" type="button">Add</button></li>';}box.innerHTML=h+'</ul>';u.appendChild(box);}`;
  }
}

// ---------- html ----------

function imgSrcset(handle: string, k: number): string {
  return [165, 360, 533, 720, 940, 1066, 1600]
    .map((w) => `/cdn/shop/files/${handle}-${k}.jpg?v=1712345678&amp;width=${w} ${w}w`)
    .join(", ");
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function card(g: Gen, s: StoreSpec, p: Product, n: number): string {
  const alt = g.chance(s.faults.cardAltMissing) ? "" : ` alt="${esc(p.title)}"`;
  const sale = p.compareAt !== null;
  const id = `${p.id}-${n}`;
  const wishlist = s.faults.wishlistButtonsUnnamed
    ? `<button class="wishlist-button" type="button" data-product="${p.id}">${icon(g, "heart", 6)}</button>`
    : `<button class="wishlist-button" type="button" data-product="${p.id}" aria-label="Add to wishlist">${icon(g, "heart", 6)}</button>`;
  return `<li class="grid__item scroll-trigger animate--slide-in" data-cascade style="--animation-order: ${n};">
<div class="card-wrapper product-card-wrapper underline-links-hover">
<div class="card card--standard card--media" style="--ratio-percent: 125.0%;">
<div class="card__inner color-scheme-2 gradient ratio" style="--ratio-percent: 125.0%;">
<div class="card__media"><div class="media media--transparent media--hover-effect">
<img srcset="${imgSrcset(p.handle, 1)}" src="/cdn/shop/files/${p.handle}-1.jpg?v=1712345678&amp;width=533" sizes="(min-width: 1200px) 267px, (min-width: 990px) calc((100vw - 130px) / 4), (min-width: 750px) calc((100vw - 120px) / 3), calc((100vw - 35px) / 2)"${alt} class="motion-reduce" loading="lazy" width="1600" height="2000">
<img srcset="${imgSrcset(p.handle, 2)}" src="/cdn/shop/files/${p.handle}-2.jpg?v=1712345678&amp;width=533" sizes="(min-width: 1200px) 267px, (min-width: 990px) calc((100vw - 130px) / 4), (min-width: 750px) calc((100vw - 120px) / 3), calc((100vw - 35px) / 2)" alt="" class="motion-reduce" loading="lazy" width="1600" height="2000">
</div></div>
<div class="card__content"><div class="card__information"><h3 class="card__heading"><a href="/products/${p.handle}" id="StandardCardNoMediaLink-${id}" class="full-unstyled-link" aria-labelledby="StandardCardNoMediaLink-${id} NoMediaStandardBadge-${id}">${esc(p.title)}</a></h3></div>
<div class="card__badge top left"></div></div>
</div>
<div class="card__content">
<div class="card__information">
<h3 class="card__heading h5" id="title-${id}"><a href="/products/${p.handle}" id="CardLink-${id}" class="full-unstyled-link" aria-labelledby="CardLink-${id} Badge-${id}">${esc(p.title)}</a></h3>
<div class="card-information"><span class="caption-large light">${esc(p.vendor)}</span>
<div class="price${sale ? " price--on-sale" : ""}"><div class="price__container">
<div class="price__regular"><span class="visually-hidden visually-hidden--inline">Regular price</span><span class="price-item price-item--regular">${money(p.price)} USD</span></div>
<div class="price__sale"><span class="visually-hidden visually-hidden--inline">Regular price</span><span><s class="price-item price-item--regular">${money(p.compareAt ?? p.price)}</s></span><span class="visually-hidden visually-hidden--inline">Sale price</span><span class="price-item price-item--sale price-item--last">${money(p.price)} USD</span></div>
<small class="unit-price caption hidden"><span class="visually-hidden">Unit price</span><span class="price-item price-item--last"><span></span><span aria-hidden="true">/</span><span class="visually-hidden">&nbsp;per&nbsp;</span><span></span></span></small>
</div></div>
</div>
</div>
<div class="quick-add no-js-hidden"><modal-opener data-modal="#QuickAdd-${id}"><button id="quick-add-${id}-submit" type="button" name="add" class="quick-add__submit button button--full-width button--secondary" aria-haspopup="dialog">Choose options</button></modal-opener></div>
${wishlist}
<div class="card__badge bottom left">${sale ? `<span id="Badge-${id}" class="badge badge--bottom-left color-scheme-4">Sale</span>` : ""}</div>
</div>
</div>
</div>
</li>`;
}

function cardGrid(g: Gen, s: StoreSpec, count: number, offset: number): string {
  const items = Array.from({ length: count }, (_, i) => card(g, s, s.products[(offset + i) % s.products.length], offset + i)).join("\n");
  return `<ul class="grid product-grid contains-card contains-card--product grid--4-col-desktop grid--2-col-tablet-down" role="list">\n${items}\n</ul>`;
}

function header(g: Gen, s: StoreSpec): string {
  const menu = Array.from({ length: s.sizes.menuItems }, (_, i) => {
    const title = g.pick(ADJ) + " " + g.pick(NOUN) + "s";
    const subs = Array.from({ length: g.int(4, 12) }, (_, j) => {
      const c = s.collections[(i + j) % s.collections.length];
      return `<li><a href="/collections/${c}" class="mega-menu__link link">${esc(g.pick(ADJ) + " " + g.pick(NOUN) + "s")}</a></li>`;
    }).join("");
    return `<li><header-menu><details id="Details-HeaderMenu-${i}" class="mega-menu"><summary id="HeaderMenu-${i}" class="header__menu-item list-menu__item link focus-inset"><span>${esc(title)}</span>${icon(g, "caret", 4)}</summary><div id="MegaMenu-Content-${i}" class="mega-menu__content color-scheme-1 gradient motion-reduce global-settings-popup" tabindex="-1"><ul class="mega-menu__list page-width" role="list">${subs}</ul></div></details></header-menu></li>`;
  }).join("\n");
  const named = (label: string) => (s.faults.iconLinksUnnamed ? "" : `<span class="visually-hidden">${label}</span>`);
  return `<div id="shopify-section-announcement-bar" class="shopify-section"><div class="announcement-bar color-scheme-1 gradient" role="region" aria-label="Announcement"><div class="page-width"><p class="announcement-bar__message h5"><span>Free shipping on orders over $75</span></p></div></div></div>
<div id="shopify-section-header" class="shopify-section shopify-section-group-header-group section-header"><link rel="stylesheet" href="/cdn/shop/t/1/assets/component-list-menu.css?v=151968516119678728991712345678" media="print" onload="this.media='all'">
<sticky-header data-sticky-type="on-scroll-up" class="header-wrapper color-scheme-1 gradient header-wrapper--border-bottom"><header class="header header--middle-left header--mobile-center page-width header--has-menu header--has-social header--has-account">
<header-drawer data-breakpoint="tablet"><details id="Details-menu-drawer-container" class="menu-drawer-container"><summary class="header__icon header__icon--menu header__icon--summary link focus-inset" aria-label="Menu"><span>${icon(g, "hamburger", 6)}${icon(g, "close", 6)}</span></summary><div id="menu-drawer" class="gradient menu-drawer motion-reduce color-scheme-1"><div class="menu-drawer__inner-container"><nav class="menu-drawer__navigation"><ul class="menu-drawer__menu has-submenu list-menu" role="list"></ul></nav></div></div></details></header-drawer>
<a href="/" class="header__heading-link link link--text focus-inset"><div class="header__heading-logo-wrapper"><img src="/cdn/shop/files/logo.png?v=1712345678&amp;width=600" alt="${esc(s.name)}" srcset="/cdn/shop/files/logo.png?v=1712345678&amp;width=90 90w, /cdn/shop/files/logo.png?v=1712345678&amp;width=135 135w, /cdn/shop/files/logo.png?v=1712345678&amp;width=180 180w" width="90" height="34" loading="eager" class="header__heading-logo motion-reduce" sizes="(max-width: 180px) 50vw, 90px"></div></a>
<nav class="header__inline-menu"><ul class="list-menu list-menu--inline" role="list">
${menu}
</ul></nav>
<div class="header__icons header__icons--localization header-localization">
<details-modal class="header__search"><details><summary class="header__icon header__icon--search header__icon--summary link focus-inset modal__toggle" aria-haspopup="dialog" aria-label="Search"><span>${icon(g, "search", 8)}</span></summary></details></details-modal>
<a href="/account/login" class="header__icon header__icon--account link focus-inset small-hide">${icon(g, "account", 10)}${named("Log in")}</a>
<a href="/cart" class="header__icon header__icon--cart link focus-inset" id="cart-icon-bubble">${icon(g, "cart", 10)}${named("Cart")}</a>
</div></header></sticky-header></div>`;
}

function footer(g: Gen, s: StoreSpec): string {
  const cols = Array.from({ length: s.sizes.footerColumns }, () => {
    const links = Array.from({ length: g.int(5, 10) }, () => `<li><a href="/pages/${slug(g.words(2))}" class="link link--text list-menu__item list-menu__item--link">${esc(g.words(g.int(1, 3)))}</a></li>`).join("");
    return `<div class="footer-block grid__item footer-block--menu scroll-trigger animate--slide-in"><h2 class="footer-block__heading inline-richtext">${esc(g.words(2))}</h2><ul class="footer-block__details-content list-unstyled">${links}</ul></div>`;
  }).join("\n");
  const social = ["Facebook", "Instagram", "TikTok", "Pinterest", "YouTube"]
    .map((n) => `<li class="list-social__item"><a href="https://${n.toLowerCase()}.example/${slug(s.name)}" class="link list-social__link">${icon(g, n.toLowerCase(), 14)}${s.faults.socialLinksUnnamed ? "" : `<span class="visually-hidden">${n}</span>`}</a></li>`)
    .join("");
  const payments = ["American Express", "Apple Pay", "Diners Club", "Discover", "Google Pay", "Mastercard", "PayPal", "Shop Pay", "Venmo", "Visa"]
    .slice(0, g.int(5, 10))
    .map((n) => paymentIcon(g, n))
    .join("");
  const email = s.faults.newsletterUnlabelled
    ? `<input id="NewsletterForm--footer" type="email" name="contact[email]" class="field__input" value="" aria-required="true" autocorrect="off" autocapitalize="off" autocomplete="email" placeholder="Email" required>`
    : `<input id="NewsletterForm--footer" type="email" name="contact[email]" class="field__input" value="" aria-required="true" autocorrect="off" autocapitalize="off" autocomplete="email" placeholder="Email" required><label class="field__label" for="NewsletterForm--footer">Email</label>`;
  return `<footer class="footer color-scheme-1 gradient section-sections--footer-padding"><div class="footer__content-top page-width"><div class="footer__blocks-wrapper grid grid--1-col grid--2-col grid--4-col-tablet scroll-trigger animate--slide-in">
${cols}
</div>
<div class="footer-block--newsletter scroll-trigger animate--slide-in"><div class="footer-block__newsletter"><h2 class="footer-block__heading inline-richtext">Subscribe to our emails</h2><form method="post" action="/contact#ContactFooter" id="ContactFooter" accept-charset="UTF-8" class="footer__newsletter newsletter-form"><input type="hidden" name="form_type" value="customer"><input type="hidden" name="utf8" value="✓"><input type="hidden" name="contact[tags]" value="newsletter"><div class="newsletter-form__field-wrapper"><div class="field">${email}<button type="submit" class="newsletter-form__button field__button" name="commit" id="Subscribe" aria-label="Subscribe">${icon(g, "arrow", 6)}</button></div></div></form></div>
<ul class="footer__list-social list-unstyled list-social" role="list">${social}</ul></div></div>
<div class="footer__content-bottom"><div class="footer__content-bottom-wrapper page-width"><div class="footer__column footer__localization isolate"><localization-form><form method="post" action="/localization" id="FooterCountryForm" accept-charset="UTF-8" class="localization-form"><div><h2 class="caption-large text-body" id="FooterCountryLabel">Country/region</h2><div class="disclosure"><button type="button" class="disclosure__button localization-form__select localization-selector link link--text caption-large" aria-controls="FooterCountryList" aria-describedby="FooterCountryLabel"><span>United States | USD $</span></button></div></div></form></localization-form></div>
<div class="footer__column footer__column--info"><div class="footer__payment"><span class="visually-hidden">Payment methods</span><ul class="list list-payment" role="list">${payments}</ul></div></div></div>
<div class="footer__content-bottom-wrapper page-width"><div class="footer__copyright caption"><small class="copyright__content">&copy; 2026, <a href="/" title="">${esc(s.name)}</a></small><small class="copyright__content"><a target="_blank" rel="nofollow" href="https://www.shopify.com?utm_campaign=poweredby">Powered by Shopify</a></small></div></div></div></footer>`;
}

function richText(g: Gen, n: number): string {
  return Array.from({ length: n }, () => `<p>${esc(Array.from({ length: g.int(2, 5) }, () => g.sentence()).join(" "))}</p>`).join("\n");
}

function homeMain(g: Gen, s: StoreSpec): string {
  const slides = Array.from({ length: g.int(2, 4) }, (_, i) => `<div class="slideshow__slide grid__item grid--1-col slider__slide" id="Slide-template--home__slideshow-${i + 1}" role="group" aria-roledescription="Slide" aria-label="${i + 1} of 3" tabindex="-1"><div class="slideshow__media banner__media media"><img src="/cdn/shop/files/hero-${i}.jpg?v=1712345678&amp;width=3840" alt="" srcset="${imgSrcset("hero", i)}" width="3840" height="1600" sizes="100vw" fetchpriority="${i === 0 ? "high" : "auto"}"></div><div class="slideshow__text-wrapper banner__content page-width"><div class="slideshow__text banner__box content-container"><h2 class="banner__heading inline-richtext h1">${esc(g.words(3))}</h2><div class="banner__text rte"><p>${esc(g.sentence())}</p></div><div class="banner__buttons"><a href="/collections/${s.collections[i % s.collections.length]}" class="button button--primary">Shop now</a></div></div></div></div>`).join("\n");
  const sliderButton = (dir: string, label: string) =>
    `<button type="button" class="slider-button slider-button--${dir}" name="${dir}"${s.faults.sliderButtonsUnnamed ? "" : ` aria-label="${label}"`} aria-controls="Slider-home">${icon(g, "caret", 4)}</button>`;
  const sections = [
    `<div id="shopify-section-template--home__slideshow" class="shopify-section section"><slideshow-component class="slider-mobile-gutter page-width mobile-text-below" role="region" aria-roledescription="Carousel" aria-label="Slideshow about our collections"><div class="slideshow__controls slider-buttons">${sliderButton("prev", "Previous slide")}${sliderButton("next", "Next slide")}</div><div class="slideshow banner banner--large grid grid--1-col slider slider--everywhere" id="Slider-home" aria-live="polite" aria-atomic="true">${slides}</div></slideshow-component></div>`,
  ];
  for (let i = 0; i < s.sizes.homeSections; i++) {
    const kind = g.int(0, 3);
    if (kind <= 1) {
      sections.push(`<div id="shopify-section-template--home__featured_collection_${i}" class="shopify-section section"><div class="color-scheme-1 isolate gradient"><div class="collection section-template--home__featured_collection_${i}-padding"><div class="collection__title title-wrapper title-wrapper--no-top-margin page-width"><h2 class="title inline-richtext h2 scroll-trigger animate--slide-in">${esc(g.words(2))}</h2></div><slider-component class="slider-mobile-gutter page-width page-width-desktop scroll-trigger animate--slide-in">${cardGrid(g, s, s.sizes.cardsPerSection, i * 7)}<div class="slider-buttons">${sliderButton("prev", "Slide left")}<div class="slider-counter caption"><span class="slider-counter--current">1</span><span aria-hidden="true"> / </span><span class="visually-hidden">of</span><span class="slider-counter--total">${s.sizes.cardsPerSection}</span></div>${sliderButton("next", "Slide right")}</div></slider-component><div class="center collection__view-all scroll-trigger animate--slide-in"><a href="/collections/${s.collections[i % s.collections.length]}" class="button" aria-label="View all products in this collection">View all</a></div></div></div></div>`);
    } else if (kind === 2) {
      sections.push(`<div id="shopify-section-template--home__image_with_text_${i}" class="shopify-section section"><div class="image-with-text image-with-text--no-overlap page-width isolate"><div class="image-with-text__grid grid grid--gapless grid--1-col grid--2-col-tablet"><div class="image-with-text__media-item grid__item"><div class="image-with-text__media media--transparent gradient color-scheme-2 global-media-settings media--adapt"><img src="/cdn/shop/files/story-${i}.jpg?v=1712345678&amp;width=1500" alt="${esc(g.words(4))}" srcset="${imgSrcset("story", i)}" width="1500" height="1000" loading="lazy" sizes="(min-width: 1200px) 550px, (min-width: 750px) calc((100vw - 130px) / 2), calc((100vw - 50px) / 2)"></div></div><div class="image-with-text__text-item grid__item"><div class="image-with-text__content image-with-text__content--middle image-with-text__content--desktop-left content-container gradient color-scheme-2"><h2 class="image-with-text__heading inline-richtext h2">${esc(g.words(3))}</h2><div class="image-with-text__text rte body">${richText(g, 2)}</div><a href="/pages/about" class="button button--primary">Our story</a></div></div></div></div></div>`);
    } else {
      const cols = Array.from({ length: g.int(3, 6) }, (_, k) => `<li class="multicolumn-list__item grid__item scroll-trigger animate--slide-in"><div class="multicolumn-card content-container"><div class="multicolumn-card__image-wrapper multicolumn-card__image-wrapper--third-width"><div class="media media--transparent media--square"><img src="/cdn/shop/files/icon-${k}.png?v=1712345678&amp;width=750" alt="" width="200" height="200" loading="lazy" class="multicolumn-card__image"></div></div><div class="multicolumn-card__info"><h3 class="inline-richtext">${esc(g.words(2))}</h3><div class="rte"><p>${esc(g.sentence())}</p></div></div></div></li>`).join("");
      sections.push(`<div id="shopify-section-template--home__multicolumn_${i}" class="shopify-section section"><div class="multicolumn color-scheme-1 gradient background-primary"><div class="page-width section-template--home__multicolumn_${i}-padding isolate"><div class="title-wrapper-with-link title-wrapper--self-padded-mobile title-wrapper--no-top-margin multicolumn__title"><h2 class="title inline-richtext h1">${esc(g.words(3))}</h2></div><slider-component class="slider-mobile-gutter"><ul class="multicolumn-list contains-content-container grid grid--1-col-tablet-down grid--3-col-desktop" role="list">${cols}</ul></slider-component></div></div></div>`);
    }
  }
  return sections.join("\n");
}

function collectionMain(g: Gen, s: StoreSpec): string {
  const groups = Array.from({ length: s.sizes.facetGroups }, (_, i) => {
    const values = Array.from({ length: g.int(4, 16) }, (_, j) => {
      const v = g.pick([...COLORS, ...SIZES, ...ADJ]);
      const id = `Filter-${i}-${j}`;
      return `<li class="list-menu__item facets__item"><checkbox-facet class="facets__label facet-checkbox"><input type="checkbox" name="filter.v.option.${i}" value="${esc(v)}" id="${id}"><svg width="1.6rem" height="1.6rem" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect width="16" height="16" stroke="currentColor" fill="none" stroke-width="1"></rect></svg><label for="${id}" class="facet-checkbox__text"><span class="facet-checkbox__text-label">${esc(v)}</span> (${g.int(1, 120)})</label></checkbox-facet></li>`;
    }).join("");
    return `<details id="Details-${i}-template--collection" class="disclosure-has-popup facets__disclosure js-filter" data-index="${i}"><summary class="facets__summary caption-large focus-offset" aria-label="${esc(g.pick(["Color", "Size", "Material", "Product type", "Price", "Availability", "Brand"]))}"><div><span>${esc(g.words(1))}</span>${icon(g, "caret", 4)}</div></summary><div id="Facet-${i}-template--collection" class="facets__display"><fieldset class="facets-wrap parent-wrap"><legend class="visually-hidden">${esc(g.words(1))}</legend><ul class="facets-layout facets-layout-list facets__list list-unstyled" role="list">${values}</ul></fieldset></div></details>`;
  }).join("\n");
  const sort = `<div class="facet-filters sorting caption"><div class="facet-filters__field"><h2 class="facet-filters__label caption-large text-body"><label for="SortBy">Sort by:</label></h2><div class="select"><select name="sort_by" class="facet-filters__sort select__select caption-large" id="SortBy">${["Featured", "Best selling", "Alphabetically, A-Z", "Alphabetically, Z-A", "Price, low to high", "Price, high to low", "Date, old to new", "Date, new to old"].map((o) => `<option value="${slug(o)}">${o}</option>`).join("")}</select></div></div></div>`;
  const pages = Array.from({ length: g.int(3, 9) }, (_, i) => `<li><a href="?page=${i + 1}" class="pagination__item link" aria-label="Page ${i + 1}">${i + 1}</a></li>`).join("");
  return `<div id="shopify-section-template--collection__banner" class="shopify-section section"><div class="collection-hero color-scheme-1 gradient"><div class="collection-hero__inner page-width scroll-trigger animate--fade-in"><div class="collection-hero__text-wrapper"><h1 class="collection-hero__title"><span class="visually-hidden">Collection: </span>${esc(g.words(2))}</h1><div class="collection-hero__description rte">${richText(g, 1)}</div></div></div></div></div>
<div id="shopify-section-template--collection__product-grid" class="shopify-section section"><div class="section-template--collection__product-grid-padding gradient color-scheme-1"><div class="facets-container facets-container-drawer scroll-trigger animate--slide-in"><aside aria-labelledby="verticalTitle" class="facets-wrapper page-width" id="main-collection-filters" data-id="template--collection__product-grid"><facet-filters-form class="facets small-hide"><form id="FacetFiltersForm" class="facets__form"><div class="facets__wrapper"><h2 class="facets__heading caption-large text-body" id="verticalTitle" tabindex="-1">Filter:</h2>
${groups}
</div>${sort}<div class="product-count light" role="status"><h2 class="product-count__text text-body"><span id="ProductCountDesktop">${s.sizes.collectionCards * 4} products</span></h2></div></form></facet-filters-form></aside></div>
<div class="product-grid-container scroll-trigger animate--slide-in" id="ProductGridContainer"><div class="collection page-width"><div class="loading-overlay gradient"></div>
${cardGrid(g, s, s.sizes.collectionCards, 3)}
<nav class="pagination" role="navigation" aria-label="Pagination"><ul class="pagination__list list-unstyled" role="list">${pages}</ul></nav></div></div></div></div>`;
}

function productJson(g: Gen, s: StoreSpec, p: Product): string {
  const colors = COLORS.slice(0, Math.max(1, Math.ceil(s.sizes.variants / SIZES.length)));
  const variants = Array.from({ length: s.sizes.variants }, (_, i) => {
    const color = colors[i % colors.length];
    const size = SIZES[Math.floor(i / colors.length) % SIZES.length];
    return {
      id: p.id * 10 + i,
      title: `${color} / ${size}`,
      option1: color,
      option2: size,
      option3: null,
      sku: `${slug(p.title).toUpperCase()}-${i}`,
      requires_shipping: true,
      taxable: true,
      featured_image: null,
      available: g.chance(0.8),
      name: `${p.title} - ${color} / ${size}`,
      public_title: `${color} / ${size}`,
      options: [color, size],
      price: p.price,
      weight: g.int(100, 2000),
      compare_at_price: p.compareAt,
      inventory_management: "shopify",
      barcode: String(g.int(100000000, 999999999)),
      requires_selling_plan: false,
      selling_plan_allocations: [],
      quantity_rule: { min: 1, max: null, increment: 1 },
    };
  });
  return JSON.stringify({
    id: p.id,
    title: p.title,
    handle: p.handle,
    description: `<p>${g.sentence(20, 60)}</p>`,
    published_at: "2026-03-14T10:00:00-04:00",
    created_at: "2026-03-14T10:00:00-04:00",
    vendor: p.vendor,
    type: g.pick(NOUN),
    tags: Array.from({ length: g.int(3, 12) }, () => g.pick(LOREM)),
    price: p.price,
    price_min: p.price,
    price_max: p.price,
    available: true,
    price_varies: false,
    compare_at_price: p.compareAt,
    variants,
    images: Array.from({ length: s.sizes.productMedia }, (_, i) => `//${s.host}/cdn/shop/files/${p.handle}-${i}.jpg?v=1712345678`),
    options: ["Color", "Size"],
    media: Array.from({ length: s.sizes.productMedia }, (_, i) => ({ alt: null, id: p.id * 100 + i, position: i + 1, aspect_ratio: 0.8, height: 2000, media_type: "image", width: 1600 })),
  });
}

function productMain(g: Gen, s: StoreSpec, p: Product): string {
  const media = Array.from({ length: s.sizes.productMedia }, (_, i) => `<li id="Slide-template--product__main-${p.id * 100 + i}" class="product__media-item grid__item slider__slide${i === 0 ? " is-active" : ""} product__media-item--variant" data-media-id="template--product__main-${p.id * 100 + i}"><div class="product-media-container media-type-image media-fit-contain global-media-settings gradient constrain-height" style="--ratio: 0.8; --preview-ratio: 0.8;"><modal-opener class="product__modal-opener product__modal-opener--image no-js-hidden" data-modal="#ProductModal-template--product__main"><span class="product__media-icon motion-reduce quick-add-hidden product__media-icon--lightbox" aria-hidden="true">${icon(g, "zoom", 6)}</span><div class="product__media media media--transparent"><img src="/cdn/shop/files/${p.handle}-${i}.jpg?v=1712345678&amp;width=1946" srcset="${imgSrcset(p.handle, i)}"${i > 0 && g.chance(s.faults.cardAltMissing) ? "" : ` alt="${esc(p.title)}"`} width="1946" height="2432" loading="${i === 0 ? "eager" : "lazy"}" sizes="(min-width: 1200px) 715px, (min-width: 990px) calc(65.0vw - 10rem), (min-width: 750px) calc((100vw - 11.5rem) / 2), calc(100vw / 1 - 4rem)"></div><button class="product__media-toggle quick-add-hidden product__media-zoom-lightbox" type="button" aria-haspopup="dialog" data-media-id="${p.id * 100 + i}"><span class="visually-hidden">Open media ${i + 1} in modal</span></button></modal-opener></div></li>`).join("\n");
  const thumbs = Array.from({ length: s.sizes.productMedia }, (_, i) => `<li id="Slide-Thumbnails-${i}" class="thumbnail-list__item slider__slide" data-target="template--product__main-${p.id * 100 + i}"><button class="thumbnail global-media-settings global-media-settings--no-shadow"${s.faults.sliderButtonsUnnamed ? "" : ` aria-label="Load image ${i + 1} in gallery view"`}${i === 0 ? ' aria-current="true"' : ""}><img src="/cdn/shop/files/${p.handle}-${i}.jpg?v=1712345678&amp;width=416" srcset="${imgSrcset(p.handle, i)}" alt="" height="208" width="208" loading="lazy"></button></li>`).join("");
  const colors = COLORS.slice(0, Math.max(1, Math.ceil(s.sizes.variants / SIZES.length)));
  const fieldset = (name: string, values: string[], k: number) =>
    `<fieldset class="js product-form__input product-form__input--pill"><legend class="form__label">${name}</legend>${values.map((v, j) => `<input type="radio" id="template--product__main-${k}-${j}" name="${name}" value="${esc(v)}" form="product-form-template--product__main"${j === 0 ? " checked" : ""}><label for="template--product__main-${k}-${j}">${esc(v)}<span class="visually-hidden label-unavailable">Sold out</span></label>`).join("")}</fieldset>`;
  const accordions = Array.from({ length: g.int(2, 5) }, (_, i) => `<div class="product__accordion accordion quick-add-hidden"><details id="Details-collapsible-row-${i}"><summary><div class="summary__title">${icon(g, "accordion", 8)}<h2 class="h4 accordion__title inline-richtext">${esc(g.words(2))}</h2></div>${icon(g, "caret", 4)}</summary><div class="accordion__content rte" id="ProductAccordion-collapsible-row-${i}">${richText(g, g.int(1, 3))}</div></details></div>`).join("\n");
  const recs = cardGrid(g, s, g.pick([4, 4, 8]), 11);
  return `<section id="MainProduct-template--product__main" class="page-width section-template--product__main-padding" data-section="template--product__main"><div class="product product--large product--left product--thumbnail_slider product--mobile-hide grid grid--1-col grid--2-col-tablet">
<div class="grid__item product__media-wrapper"><media-gallery id="MediaGallery-template--product__main" role="region" class="product__column-sticky" aria-label="Gallery Viewer" data-desktop-layout="thumbnail_slider"><div id="GalleryStatus-template--product__main" class="visually-hidden" role="status"></div><slider-component id="GalleryViewer-template--product__main" class="slider-mobile-gutter"><a class="skip-to-content-link button visually-hidden quick-add-hidden" href="#ProductInfo-template--product__main">Skip to product information</a><ul id="Slider-Gallery-template--product__main" class="product__media-list contains-media grid grid--peek list-unstyled slider slider--mobile" role="list">
${media}
</ul></slider-component><slider-component id="GalleryThumbnails-template--product__main" class="thumbnail-slider slider-mobile-gutter quick-add-hidden small-hide"><ul id="Slider-Thumbnails-template--product__main" class="thumbnail-list list-unstyled slider slider--mobile slider--tablet-up" role="list">${thumbs}</ul></slider-component></media-gallery></div>
<div class="product__info-wrapper grid__item scroll-trigger animate--slide-in"><product-info id="ProductInfo-template--product__main" class="product__info-container product__column-sticky" data-section="template--product__main" data-url="/products/${p.handle}">
<p class="product__text inline-richtext caption-with-letter-spacing">${esc(p.vendor)}</p><div class="product__title"><h1>${esc(p.title)}</h1></div>
<div class="no-js-hidden" id="price-template--product__main" role="status"><div class="price price--large${p.compareAt ? " price--on-sale" : ""} price--show-badge"><div class="price__container"><div class="price__regular"><span class="visually-hidden visually-hidden--inline">Regular price</span><span class="price-item price-item--regular">${money(p.price)} USD</span></div><div class="price__sale"><span class="visually-hidden visually-hidden--inline">Regular price</span><span><s class="price-item price-item--regular">${money(p.compareAt ?? p.price)}</s></span><span class="visually-hidden visually-hidden--inline">Sale price</span><span class="price-item price-item--sale price-item--last">${money(p.price)} USD</span></div></div></div></div>
<div class="product__tax caption rte">Tax included. <a href="/policies/shipping-policy">Shipping</a> calculated at checkout.</div>
<variant-selects id="variant-selects-template--product__main" data-section="template--product__main">${fieldset("Color", colors, 1)}${fieldset("Size", SIZES.slice(0, Math.min(SIZES.length, s.sizes.variants)), 2)}</variant-selects>
<div class="product-form__input product-form__quantity"><label class="quantity__label form__label" for="Quantity-template--product__main">Quantity</label><quantity-input class="quantity"><button class="quantity__button no-js-hidden" name="minus" type="button"><span class="visually-hidden">Decrease quantity for ${esc(p.title)}</span>${icon(g, "minus", 4)}</button><input class="quantity__input" type="number" name="quantity" id="Quantity-template--product__main" data-cart-quantity="0" data-min="1" min="1" step="1" value="1" form="product-form-template--product__main"><button class="quantity__button no-js-hidden" name="plus" type="button"><span class="visually-hidden">Increase quantity for ${esc(p.title)}</span>${icon(g, "plus", 4)}</button></quantity-input></div>
<div><product-form class="product-form" data-section-id="template--product__main"><div class="product-form__error-message-wrapper" role="alert" hidden></div><form method="post" action="/cart/add" id="product-form-template--product__main" accept-charset="UTF-8" class="form" enctype="multipart/form-data" novalidate="novalidate" data-type="add-to-cart-form"><input type="hidden" name="form_type" value="product"><input type="hidden" name="utf8" value="✓"><input type="hidden" name="id" value="${p.id * 10}" class="product-variant-id"><div class="product-form__buttons"><button id="ProductSubmitButton-template--product__main" type="submit" name="add" class="product-form__submit button button--full-width button--secondary"><span>Add to cart</span></button><div data-shopify="payment-button" class="shopify-payment-button"><button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded">Buy it now</button></div></div></form></product-form></div>
<div class="product__description rte quick-add-hidden">${richText(g, s.sizes.descParagraphs)}</div>
${accordions}
<share-button id="Share-template--product__main" class="share-button quick-add-hidden"><button class="share-button__button hidden">${icon(g, "share", 8)}Share</button></share-button>
</product-info></div></div></section>
<div id="shopify-section-template--product__app" class="shopify-section shopify-section--apps"><div class="shopify-app-block" id="judgeme_product_reviews" data-id="${p.id}"></div></div>
<div id="shopify-section-template--product__related" class="shopify-section"><product-recommendations class="related-products page-width section-template--product__related-padding isolate scroll-trigger animate--slide-in" data-url="/recommendations/products?section_id=template--product__related&amp;product_id=${p.id}&amp;limit=4"><h2 class="related-products__heading inline-richtext h2">You may also like</h2>${recs}</product-recommendations></div>
<script type="application/json" id="ProductJson">${productJson(g, s, p)}</script>`;
}

function cartMain(g: Gen, s: StoreSpec): string {
  const items = Array.from({ length: s.sizes.cartItems }, (_, i) => {
    const p = s.products[(i * 5 + 2) % s.products.length];
    const qty = g.int(1, 3);
    return `<tr class="cart-item" id="CartItem-${i + 1}"><td class="cart-item__media"><a href="/products/${p.handle}" class="cart-item__link" aria-hidden="true" tabindex="-1"></a><div class="cart-item__image-container gradient global-media-settings"><img src="/cdn/shop/files/${p.handle}-1.jpg?v=1712345678&amp;width=300" class="cart-item__image"${g.chance(s.faults.cardAltMissing) ? "" : ` alt="${esc(p.title)}"`} loading="lazy" width="150" height="188"></div></td>
<td class="cart-item__details"><a href="/products/${p.handle}" class="cart-item__name h4 break">${esc(p.title)}</a><div class="product-option">${money(p.price)}</div><dl><div class="product-option"><dt>Color: </dt><dd>${g.pick(COLORS)}</dd></div><div class="product-option"><dt>Size: </dt><dd>${g.pick(SIZES)}</dd></div></dl><p class="product-option"></p><ul class="discounts list-unstyled" role="list" aria-label="Discount"></ul></td>
<td class="cart-item__totals right medium-hide large-up-hide"><div class="cart-item__price-wrapper"><span class="price price--end">${money(p.price * qty)}</span></div></td>
<td class="cart-item__quantity"><div class="cart-item__quantity-wrapper quantity-popover-wrapper"><label class="visually-hidden" for="Quantity-${i + 1}">Quantity</label><div class="quantity-popover-container"><quantity-input class="quantity cart-quantity"><button class="quantity__button no-js-hidden" name="minus" type="button"><span class="visually-hidden">Decrease quantity for ${esc(p.title)}</span>${icon(g, "minus", 4)}</button><input class="quantity__input" data-quantity-variant-id="${p.id * 10}" type="number" name="updates[]" value="${qty}" data-cart-quantity="${qty}" min="0" data-min="1" step="1" aria-label="Quantity for ${esc(p.title)}" id="Quantity-${i + 1}" data-index="${i + 1}"><button class="quantity__button no-js-hidden" name="plus" type="button"><span class="visually-hidden">Increase quantity for ${esc(p.title)}</span>${icon(g, "plus", 4)}</button></quantity-input></div><cart-remove-button id="Remove-${i + 1}" data-index="${i + 1}"><a href="/cart/change?id=${p.id * 10}&amp;quantity=0" class="button button--tertiary"${s.faults.iconLinksUnnamed ? "" : ` aria-label="Remove ${esc(p.title)}"`}>${icon(g, "remove", 10)}</a></cart-remove-button></div></td>
<td class="cart-item__totals right small-hide"><div class="cart-item__price-wrapper"><span class="price price--end">${money(p.price * qty)}</span></div></td></tr>`;
  }).join("\n");
  const note = s.faults.newsletterUnlabelled
    ? `<textarea class="text-area field__input" name="note" form="cart" id="Cart-note" placeholder="Order special instructions"></textarea>`
    : `<label for="Cart-note">Order special instructions</label><textarea class="text-area field__input" name="note" form="cart" id="Cart-note" placeholder="Order special instructions"></textarea>`;
  return `<div id="shopify-section-template--cart__items" class="shopify-section"><cart-items class="gradient color-scheme-1 isolate section-template--cart__items-padding"><div class="page-width"><div class="title-wrapper-with-link"><h1 class="title title--primary">Your cart</h1><a href="/collections/all" class="underlined-link">Continue shopping</a></div>
<form action="/cart" class="cart__contents critical-hidden" method="post" id="cart"><div class="cart__items" id="main-cart-items" data-id="template--cart__items"><div class="js-contents"><table class="cart-items"><caption class="visually-hidden">Your cart</caption><thead><tr><th class="caption-with-letter-spacing" colspan="2" scope="col">Product</th><th class="medium-hide large-up-hide right caption-with-letter-spacing" colspan="1">Total</th><th class="cart-items__heading--wide cart-items__heading--quantity small-hide caption-with-letter-spacing" colspan="1">Quantity</th><th class="small-hide right caption-with-letter-spacing" colspan="1">Total</th></tr></thead><tbody>
${items}
</tbody></table></div></div><p class="visually-hidden" id="cart-live-region-text" aria-live="polite" role="status"></p></form></div></cart-items></div>
<div id="shopify-section-template--cart__footer" class="shopify-section cart__footer-wrapper"><div class="page-width" id="main-cart-footer" data-id="template--cart__footer"><div><div class="cart__footer isolate section-template--cart__footer-padding"><div class="cart__blocks"><cart-note class="cart__note field">${note}</cart-note>
<div class="js-contents"><div class="totals" role="status"><h2 class="totals__total">Estimated total</h2><p class="totals__total-value">${money(g.int(20, 400) * 100)} USD</p></div><small class="tax-note caption-large rte">Taxes, discounts and <a href="/policies/shipping-policy">shipping</a> calculated at checkout.</small></div>
<div class="cart__ctas"><button type="submit" id="checkout" class="cart__checkout-button button" name="checkout" form="cart">Check out</button></div><div class="cart__dynamic-checkout-buttons additional-checkout-buttons"><div class="dynamic-checkout__content" id="dynamic-checkout-cart" data-shopify="dynamic-checkout-cart"></div></div></div></div></div></div></div>
<div id="shopify-section-template--cart__recs" class="shopify-section"><div class="page-width"><h2 class="h2">${esc(g.words(3))}</h2>${cardGrid(g, s, 4, 30)}</div></div>`;
}

// ---------- pages ----------

export interface FixtureFile {
  // URL path the server answers, without query string.
  url: string;
  // File name inside the store's folder.
  file: string;
  body: string;
}

export interface PageInfo {
  kind: PageKind;
  url: string;
  file: string;
  htmlBytes: number;
  // CSS and JS files the page loads, in bytes.
  assetBytes: number;
  totalBytes: number;
}

export interface StoreFixture {
  spec: StoreSpec;
  files: FixtureFile[];
  pages: PageInfo[];
}

const ASSET = "/cdn/shop/t/1/assets/";

function page(g: Gen, s: StoreSpec, kind: PageKind, title: string, main: string, css: string[], js: string[], apps: string[]): string {
  const meta = {
    page: { pageType: kind, resourceType: kind === "product" ? "product" : kind === "collection" ? "collection" : null, resourceId: s.products[0].id },
    currency: "USD",
    products: s.products.slice(0, kind === "collection" ? 24 : 6).map((p) => ({ id: p.id, gid: `gid://shopify/Product/${p.id}`, vendor: p.vendor, type: "", variants: [{ id: p.id * 10, price: p.price, name: p.title, public_title: null, sku: "" }] })),
  };
  const themeJson = JSON.stringify({ name: s.theme.name, id: 140000000000 + s.index, schema_name: s.theme.name, schema_version: s.theme.version, theme_store_id: s.theme.id, role: "main" });
  return `<!doctype html>
<html class="js"${s.lang ? ' lang="en"' : ""}>
<head>
<meta charset="utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="">
<link rel="canonical" href="https://${s.host}/"><link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
<title>${esc(title)} &ndash; ${esc(s.name)}</title>
<meta name="description" content="${esc(g.sentence(10, 24))}">
<meta property="og:site_name" content="${esc(s.name)}"><meta property="og:url" content="https://${s.host}/"><meta property="og:title" content="${esc(title)}"><meta property="og:type" content="website"><meta property="og:description" content="${esc(g.sentence())}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(g.sentence())}">
<script src="${ASSET}constants.js?v=1712345678" defer="defer"></script>
<script src="${ASSET}global.js?v=1712345678" defer="defer"></script>
<script src="${ASSET}vendor.js?v=1712345678" defer="defer"></script>
${js.map((f) => `<script src="${ASSET}${f}?v=1712345678" defer="defer"></script>`).join("\n")}
<script>window.Shopify = window.Shopify || {}; Shopify.shop = "${slug(s.name)}-${s.index}.myshopify.com"; Shopify.locale = "en"; Shopify.currency = {"active":"USD","rate":"1.0"}; Shopify.country = "US"; Shopify.theme = ${themeJson}; Shopify.theme.handle = "null"; Shopify.cdnHost = "${s.host}/cdn"; Shopify.routes = Shopify.routes || {}; Shopify.routes.root = "/";</script>
<script>window.ShopifyAnalytics = window.ShopifyAnalytics || {}; window.ShopifyAnalytics.meta = ${JSON.stringify(meta)}; window.ShopifyAnalytics.meta.currency = 'USD';</script>
<script src="/cdn/shopifycloud/storefront.js" async></script>
${apps.map((a) => `<script src="/apps/${a}.js" async></script>`).join("\n")}
<style data-shopify>:root{--font-body-family:Assistant,sans-serif;--font-body-style:normal;--font-body-weight:400;--font-heading-family:Assistant,sans-serif;--font-heading-weight:400;--font-body-scale:1.0;--font-heading-scale:1.0;--media-padding:px;--media-border-opacity:0.05;--media-border-width:1px;--media-radius:0px;--media-shadow-opacity:0.0;--page-width:120rem;--page-width-margin:0rem;--product-card-image-padding:0.0rem;--product-card-corner-radius:0.0rem;--product-card-text-alignment:left;--product-card-border-width:0.0rem;--product-card-border-opacity:0.1;--badge-corner-radius:4.0rem;--popup-border-width:1px;--spacing-sections-desktop:0px;--spacing-sections-mobile:0px;--grid-desktop-vertical-spacing:8px;--grid-desktop-horizontal-spacing:8px;--text-boxes-radius:0px;--buttons-radius:0px;--inputs-radius:0px}</style>
<link href="${ASSET}base.css?v=1712345678" rel="stylesheet" type="text/css" media="all">
${css.map((f) => `<link href="${ASSET}${f}?v=1712345678" rel="stylesheet" type="text/css" media="all">`).join("\n")}
</head>
<body class="gradient animate--hover-default">
<a class="skip-to-content-link button visually-hidden" href="#MainContent">Skip to content</a>
${header(g, s)}
<main id="MainContent" class="content-for-layout focus-none" role="main" tabindex="-1">
${main}
</main>
<div id="shopify-section-footer" class="shopify-section shopify-section-group-footer-group">${footer(g, s)}</div>
<ul hidden><li id="a11y-refresh-page-message">Choosing a selection results in a full page refresh.</li><li id="a11y-new-window-message">Opens in a new window.</li></ul>
<script>window.shopUrl = 'https://${s.host}'; window.routes = { cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_update_url: '/cart/update', cart_url: '/cart', predictive_search_url: '/search/suggest' }; window.cartStrings = { error: "There was an error while updating your cart. Please try again.", quantityError: "You can only add [quantity] of this item to your cart." }; window.variantStrings = { addToCart: "Add to cart", soldOut: "Sold out", unavailable: "Unavailable", unavailable_with_option: "[value] - Unavailable" };</script>
</body>
</html>
`;
}

export function generateStore(seed: number, index: number): StoreFixture {
  const s = storeSpec(seed, index);
  const g = new Gen(mulberry32((seed ^ 0x9e3779b9) + index * 7919));
  const assets: FixtureFile[] = [
    { url: `${ASSET}base.css`, file: "base.css", body: themeCss(g, s) },
    { url: `${ASSET}component-list-menu.css`, file: "component-list-menu.css", body: sectionCss(g, "list-menu", 4) },
    { url: `${ASSET}section-collection.css`, file: "section-collection.css", body: sectionCss(g, "collection", g.int(10, 35)) },
    { url: `${ASSET}section-product.css`, file: "section-product.css", body: sectionCss(g, "product", g.int(10, 35)) },
    { url: `${ASSET}section-cart.css`, file: "section-cart.css", body: sectionCss(g, "cart", g.int(6, 20)) },
    { url: `${ASSET}constants.js`, file: "constants.js", body: jsBundle(g, "constants", 2, "") },
    { url: `${ASSET}global.js`, file: "global.js", body: jsBundle(g, "global", s.sizes.themeJsKb, THEME_INIT) },
    { url: `${ASSET}vendor.js`, file: "vendor.js", body: jsBundle(g, "vendor", s.sizes.vendorJsKb, "") },
    { url: `${ASSET}facets.js`, file: "facets.js", body: jsBundle(g, "facets", g.int(10, 30), "") },
    { url: `${ASSET}product-info.js`, file: "product-info.js", body: jsBundle(g, "productInfo", g.int(15, 45), "") },
    { url: `${ASSET}cart.js`, file: "cart.js", body: jsBundle(g, "cart", g.int(8, 25), "") },
    { url: "/cdn/shopifycloud/storefront.js", file: "storefront.js", body: jsBundle(g, "storefront", s.sizes.storefrontJsKb, "") },
  ];
  const apps = (Object.keys(s.apps) as (keyof StoreSpec["apps"])[]).filter((a) => s.apps[a]);
  for (const a of apps) assets.push({ url: `/apps/${a}.js`, file: `app-${a}.js`, body: jsBundle(g, `app_${a}`, s.sizes.appJsKb, appInit(a, s, g)) });

  const product = s.products[0];
  const defs: { kind: PageKind; url: string; title: string; main: () => string; css: string[]; js: string[] }[] = [
    { kind: "home", url: "/", title: s.name, main: () => homeMain(g, s), css: ["section-collection.css"], js: [] },
    { kind: "collection", url: `/collections/${s.collections[0]}`, title: "Collection", main: () => collectionMain(g, s), css: ["section-collection.css"], js: ["facets.js"] },
    { kind: "product", url: `/products/${product.handle}`, title: product.title, main: () => productMain(g, s, product), css: ["section-product.css", "section-collection.css"], js: ["product-info.js"] },
    { kind: "cart", url: "/cart", title: "Your Shopping Cart", main: () => cartMain(g, s), css: ["section-cart.css"], js: ["cart.js"] },
  ];
  const size = (f: string) => Buffer.byteLength(assets.find((a) => a.file === f)?.body ?? "");
  const shared = ["base.css", "component-list-menu.css", "constants.js", "global.js", "vendor.js", "storefront.js", ...apps.map((a) => `app-${a}.js`)];
  const files: FixtureFile[] = [...assets];
  const pages: PageInfo[] = [];
  for (const d of defs) {
    const pageApps = apps.filter((a) => a !== "upsell" || d.kind === "cart" || d.kind === "product");
    const body = page(g, s, d.kind, d.title, d.main(), d.css, d.js, pageApps);
    const file = `${d.kind}.html`;
    files.push({ url: d.url, file, body });
    const htmlBytes = Buffer.byteLength(body);
    const loaded = [...shared.filter((f) => !f.startsWith("app-") || pageApps.includes(f.slice(4, -3) as keyof StoreSpec["apps"])), ...d.css, ...d.js];
    const assetBytes = loaded.reduce((n, f) => n + size(f), 0);
    pages.push({ kind: d.kind, url: d.url, file, htmlBytes, assetBytes, totalBytes: htmlBytes + assetBytes });
  }
  return { spec: s, files, pages };
}

// ---------- on disk ----------

export interface FixtureManifest {
  version: number;
  seed: number;
  stores: { index: number; host: string; pages: PageInfo[]; routes: Record<string, string> }[];
}

export const ROBOTS_TXT = `# Shopify-style robots.txt for the benchmark. /cart is allowed so all four page types are scanned.
User-agent: *
Disallow: /admin
Disallow: /checkouts/
Disallow: /checkout
Disallow: /account
Disallow: /search
Disallow: /*?*oseid=*
`;

// Writes `count` stores under `dir`, or reuses them when a manifest for the
// same version and seed already lists at least that many.
export function writeFixtures(dir: string, seed: number, count: number): FixtureManifest {
  const manifestFile = path.join(dir, "manifest.json");
  if (fs.existsSync(manifestFile)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as FixtureManifest;
      if (m.version === FIXTURE_VERSION && m.seed === seed && m.stores.length >= count) return { ...m, stores: m.stores.slice(0, count) };
    } catch {
      // rebuild below
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  const manifest: FixtureManifest = { version: FIXTURE_VERSION, seed, stores: [] };
  for (let i = 0; i < count; i++) {
    const store = generateStore(seed, i);
    const sdir = path.join(dir, `s${i}`);
    fs.mkdirSync(sdir, { recursive: true });
    const routes: Record<string, string> = {};
    for (const f of store.files) {
      fs.writeFileSync(path.join(sdir, f.file), f.body);
      routes[f.url] = f.file;
    }
    manifest.stores.push({ index: i, host: store.spec.host, pages: store.pages, routes });
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  return manifest;
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript" };

export interface FixtureServer {
  port: number;
  requests: number;
  close(): Promise<void>;
}

// Serves the stores in `manifest` from `dir`, choosing the store by the Host
// header. Any collection or product handle gets that store's one collection
// or product page, as the census follows whatever links the home page has.
export async function serveFixtures(dir: string, manifest: FixtureManifest): Promise<FixtureServer> {
  const byHost = new Map(manifest.stores.map((s) => [s.host, s]));
  const state = { requests: 0 };
  const server = http.createServer((req, res) => {
    state.requests++;
    const host = String(req.headers.host ?? "").split(":")[0];
    const store = byHost.get(host);
    const urlPath = (req.url ?? "/").split("?")[0];
    if (!store) return void res.writeHead(404).end("no such store");
    if (urlPath === "/robots.txt") return void res.writeHead(200, { "content-type": "text/plain" }).end(ROBOTS_TXT);
    let file = store.routes[urlPath];
    if (!file && /^\/collections\/[^/]+\/?$/.test(urlPath)) file = "collection.html";
    if (!file && /^\/products\/[^/]+\/?$/.test(urlPath)) file = "product.html";
    if (!file) return void res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    const full = path.join(dir, `s${store.index}`, file);
    const ext = path.extname(file);
    fs.stat(full, (err, st) => {
      if (err) return void res.writeHead(404).end();
      res.writeHead(200, {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "content-length": st.size,
        "cache-control": ext === ".html" ? "private, no-store" : "public, max-age=31536000",
      });
      fs.createReadStream(full).pipe(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    port,
    get requests() {
      return state.requests;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
