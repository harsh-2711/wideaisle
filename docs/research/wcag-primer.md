# WCAG 2.2 AA for Shopify builders

Task T-010 · M1 research lane · Checked 2026-10-08 · Not legal advice

## The answer first

- WCAG 2.2 is the current W3C standard. Level AA means a page meets every Level A and Level AA success criterion: 55 criteria in WCAG 2.2 (our count from the standard: 31 at A, 24 at AA) [S1] (opened).
- Laws and courts mostly cite WCAG 2.1 AA today. The EU's next harmonised standard (EN 301 549 V4.1.1) moves to WCAG 2.2 [S11] (via search, not opened). WCAG 2.2 keeps everything in 2.1 except 4.1.1 Parsing, which W3C removed [S3] (via search, not opened). Building to 2.2 AA covers 2.1 AA.
- Conformance is all or nothing per page and per process. WCAG's own example is an online store: every page from product selection to the end of checkout must conform before any page in that process can [S1] (opened). Shopify checkout sits outside the theme, so no theme app can make a whole purchase process conform on its own.
- Six failure types make up 96% of errors detected on the top million home pages [S5] (via search, not opened). They map to six criteria groups: 1.4.3, 1.1.1, 1.3.1/3.3.2/4.1.2, 2.4.4, 4.1.2 and 3.1.1. v1 fixes those six where the cause sits in theme code, theme settings or product image alt text.
- Automated tools catch a minority of failures. axe-core 4.14 has rules that can report a failure for 17 of the 55 A and AA criteria, and review-only flags for 4 more [S4] (opened). For most of those 17 it tests one way the criterion can fail, not all of them.
- Shopify's free themes ship with most controls named. In Dawn 16.0.0 the menu drawer, cart drawer, variant picker, price and newsletter form all carry labels or hidden text [S7] (opened). On real stores, failures mostly come from colour settings, missing alt text, apps, custom sections and older or paid themes. Our M2 census will measure this; until then treat it as a working assumption.

## How to read this primer

- **Level A** is the floor. **Level AA** adds criteria such as contrast, focus visibility and reflow. AAA is not required by any law we track.
- **Full pages.** Every responsive variation must conform, so the mobile menu drawer counts as much as the desktop menu [S1] (opened).
- **Partial conformance.** Where third-party content cannot be fixed, WCAG lets the author say so in a "Statement of Partial Conformance" [S1] (opened). This is the honest frame for app widgets and checkout in our evidence pack.
- **"Automated?" column.** Yes means axe-core has a rule that flags the common failure. Partly means it flags some forms of it, or only asks for human review. No means a person (or a scripted test) must check it. Rule names are axe-core 4.14 [S4] (opened).
- **"In v1?" column.** Yes means a v1 fixer targets it. No means it is out of v1 per the roadmap's "Not in v1" list or because no theme fix can solve it.
- **"What fails" column.** These are the common failures reported in public audits and Shopify's theme guidance, plus what we saw in Dawn's code. They are not yet measured by us. M2 replaces them with census data.

Contrast thresholds used throughout: 4.5:1 for normal text, 3:1 for large text, 3:1 for UI components and focus indicators [S1] (opened). Large text is about 18 point regular or 14 point bold.

## The six failure types

| Failure | WCAG criteria | Home pages affected, 2026 | axe-core rule | Typical Shopify cause | In v1? |
|---|---|---|---|---|---|
| Low-contrast text | 1.4.3 Contrast (Minimum), AA | 83.9% | `color-contrast` | Brand colours set in theme settings: light grey body text, white text on pale buttons, sale badges, announcement bars | Yes: adjusts colour tokens, merchant previews first |
| Missing alt text | 1.1.1 Non-text Content, A | 53.1% | `image-alt`, `svg-img-alt`, `role-img-alt` | Product and collection images uploaded with no alt text; logo images; banner images | Yes: AI drafts alt text, merchant reviews, written through the Admin API |
| Missing form labels | 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions (A), 4.1.2 Name, Role, Value (A) | 51% | `label`, `select-name` | Newsletter, search, contact and quantity fields with no label, or a placeholder only | Yes: adds real labels |
| Empty links | 2.4.4 Link Purpose (In Context), A; 4.1.2 | 46.3% | `link-name` | Icon links (logo, social, cart, account) with no text; image links whose image has no alt | Yes: names icon links from context |
| Empty buttons | 4.1.2 Name, Role, Value, A | 30.6% | `button-name` | Icon buttons: menu, close, quantity plus and minus, slider arrows | Yes: names icon buttons |
| Missing page language | 3.1.1 Language of Page, A | 13.5% | `html-has-lang`, `html-lang-valid` | Older or custom layouts with no `lang` on `<html>` | Yes: sets it from the store locale |

Shares are from the WebAIM Million 2026 as reported by secondary write-ups [S5] (via search, not opened). WebAIM's own page was blocked from this container. The same write-ups say the six types are 96% of detected errors and that Shopify home pages average 75.1 detected errors against 56.1 for all home pages [S5, S6] (via search, not opened).

Two traps in this table:

1. **A placeholder passes the axe `label` rule.** The rule accepts a non-empty placeholder as a name [S4] (opened). A newsletter field with only "Email" as placeholder text can pass the scan and still fail 3.3.2 for a person, because the hint disappears on typing. Our fixer should add a real label even when axe is silent.
2. **An empty `alt=""` passes the axe `image-alt` rule.** It marks an image as decorative. A product image with `alt=""` passes the scan but fails 1.1.1 if the image carries information. Dawn outputs whatever alt text the merchant saved, so a store with no alt text can show `alt=""` or no alt at all depending on the snippet [S7] (opened; exact output on a live store unverified, check in Spike C).

## Header

| Criterion | What fails in typical themes | How to check | Automated? | In v1? |
|---|---|---|---|---|
| 2.4.1 Bypass Blocks (A) | No skip link, or a skip link whose target does not exist | Load the page, press Tab once. "Skip to content" should appear and move focus to the main content | Partly: `bypass` asks for review | No |
| 2.4.4 Link Purpose, 4.1.2 Name, Role, Value (A) | Logo, cart, account and search icon links with no accessible name | VoiceOver rotor (VO+U), Links list: any entry read as just "link" | Yes: `link-name` | Yes (empty links) |
| 1.1.1 Non-text Content (A) | Logo image with no alt, or alt set to a file name | Rotor Images list, or inspect the `<img>` | Partly: missing alt only, not wrong alt | Yes for missing alt; wrong alt is content |
| 1.4.3 Contrast (Minimum) (AA) | Announcement bar text on brand colour; menu links on a transparent header over a hero image | axe scan, then a contrast checker on what it marks "needs review" | Partly: text over images goes to review | Yes for theme colours; not for text over photos |
| 2.2.2 Pause, Stop, Hide (A) | Auto-rotating announcement bar or scrolling marquee with no pause control | Watch for movement longer than 5 seconds; look for a pause button | No (axe only checks `<blink>` and `<marquee>`) | No |
| 2.1.1 Keyboard (A) | Dropdown menus that open on hover only | Tab to a menu item; Enter or Space should open it, Escape should close it | No | No |
| 1.4.13 Content on Hover or Focus (AA) | Mega menu closes when the pointer moves onto it, or cannot be dismissed without moving focus | Hover and focus each menu; press Escape | No | No |
| 2.4.7 Focus Visible (AA) | `outline: none` in theme CSS with no replacement | Tab through the header and watch for a visible focus ring | No | No |
| 2.4.11 Focus Not Obscured (Minimum) (AA, new in 2.2) | A sticky header covers the focused element as you tab down the page | Tab down a long page; the focused item must not be fully hidden | No | No |
| 2.5.8 Target Size (Minimum) (AA, new in 2.2) | Icon links smaller than 24 by 24 CSS pixels with tight spacing | Measure in dev tools | Partly: `target-size` exists but is off by default [S4] | No |
| 4.1.2 Name, Role, Value (A) | Country and language selectors with no name or no expanded state | Rotor Form Controls; expand and listen for "expanded" | Partly: missing names only | Yes for missing names |
| 1.3.1, 3.3.2, 4.1.2 (A) | Header search field with no label | Rotor Form Controls: the field should read "Search" | Yes: `label` (placeholder passes) | Yes |

Dawn has a skip link to `#MainContent`, hidden "Cart" text on the cart icon, hidden headings for the localisation selectors and a `lang` attribute taken from the store locale [S7] (opened).

## Menu drawer (mobile navigation)

| Criterion | What fails in typical themes | How to check | Automated? | In v1? |
|---|---|---|---|---|
| 4.1.2 Name, Role, Value (A) | Hamburger is a `<div>` or an icon button with no name; no expanded state | VoiceOver on the toggle: expect "Menu, collapsed, button" or similar | Partly: `button-name` catches no name; state is not checked | Yes for the name only |
| 2.4.3 Focus Order (A) | Focus stays behind the drawer when it opens, or does not return to the toggle when it closes | Open with Enter, press Tab: focus should be inside the drawer. Close: focus should return to the toggle | No | No |
| 2.1.1 Keyboard, 2.1.2 No Keyboard Trap (A) | Close button not reachable by Tab; Escape does nothing; focus stuck in a submenu | Open, close and move between levels using only the keyboard | No | No |
| 1.3.1 Info and Relationships (A) | Submenu levels not exposed as nested lists; "Back" buttons unnamed | Rotor Lists; listen for list counts | Partly: `list`, `listitem`; unnamed buttons via `button-name` | Yes for unnamed buttons |
| 2.4.4, 4.1.2 (A) | Social icon links in the drawer with no text | Rotor Links list | Yes: `link-name` | Yes |
| 1.4.10 Reflow (AA) | Drawer content cut off or needs sideways scrolling at 320 CSS pixels wide (400% zoom) | Set the browser to 1280 px wide and zoom to 400% | No | No |
| 2.5.8 Target Size (Minimum) (AA) | Close and back icons under 24 by 24 CSS pixels | Measure in dev tools | Partly: rule off by default | No |
| 1.4.11 Non-text Contrast (AA) | Focus ring or chevron icons under 3:1 against the drawer background | Contrast checker on the focus ring | No | No |

Dawn builds the drawer from `<details>` and `<summary>` with `aria-label="Menu"`, and adds hidden text to social links [S7] (opened). Shopify's theme review asks that drawers and modals move focus into themselves and close with Escape [S9] (via search, not opened).

## Product form (product page)

| Criterion | What fails in typical themes | How to check | Automated? | In v1? |
|---|---|---|---|---|
| 1.1.1 Non-text Content (A) | Product images with no alt, the file name as alt, or the product title repeated on every image | Rotor Images list; compare each alt with the image | Partly: missing alt only | Yes: AI draft plus merchant review |
| 1.3.1 Info and Relationships (A) | Sale price shown only by strike-through, so a screen reader reads two prices with no meaning | Listen to the price: expect "Regular price ... Sale price ..." | No | No |
| 1.4.1 Use of Color (A) | Sale price or "Sold out" shown only by colour | View in greyscale | No (axe checks links in text only) | No |
| 1.3.1, 3.3.2, 4.1.2 (A) | Quantity field with no label | Rotor Form Controls: expect "Quantity" | Yes: `label` | Yes |
| 4.1.2 Name, Role, Value (A) | Quantity plus and minus buttons, gallery arrows and thumbnail buttons with no name | Tab to each; listen for a name | Yes: `button-name` | Yes |
| 4.1.3 Status Messages (AA) | "Added to cart" or "Sold out" messages that appear on screen but are not announced | Add to cart with VoiceOver on; listen for an announcement without moving focus | No | No |
| 3.3.1 Error Identification (A) | Errors such as "Only 3 left" appear visually but are not announced or tied to the field | Enter too high a quantity; listen | No | No |
| 1.4.3 Contrast (Minimum) (AA) | Button text on brand colour; sale and "Sold out" badges; placeholder text | axe scan | Yes: `color-contrast` | Yes for theme colours |
| 1.4.11 Non-text Contrast (AA) | Quantity field border and focus ring under 3:1 | Contrast checker | No | No |
| 1.2.2 Captions, 1.4.2 Audio Control, 2.2.2 (A) | Product videos with no captions; videos that autoplay | Play each video | Partly: `video-caption` and `no-autoplay-audio` ask for review | No (content) |
| 1.4.5 Images of Text (AA) | Size charts and feature callouts uploaded as images | Look for text inside images | No | No (content) |
| 2.4.3 Focus Order (A) | Image zoom or "quick view" modal does not take or return focus | Open and close with the keyboard | No | No |
| 2.5.7 Dragging Movements (AA, new in 2.2) | Gallery images change only by swiping or dragging, with no buttons | Change images using single clicks only | No | No |
| 2.5.8 Target Size (Minimum) (AA) | Quantity buttons and thumbnails smaller than 24 by 24 CSS pixels | Measure in dev tools | Partly: rule off by default | No |

Dawn hides "Regular price" and "Sale price" text for screen readers, labels the quantity field, names the quantity buttons and wraps the price in `role="status"` so changes are announced [S7] (opened). The express payment buttons (for example Shop Pay) are rendered by Shopify, not the theme. We list them as a known limitation.

## Variant picker

| Criterion | What fails in typical themes | How to check | Automated? | In v1? |
|---|---|---|---|---|
| 1.3.1 Info and Relationships (A) | Options are loose buttons or `<div>`s with no group name, so "Small" is read without "Size" | Rotor Form Controls: expect a group name such as "Size" | No | No |
| 4.1.2 Name, Role, Value (A) | Colour swatches with no name (only a coloured circle or image); selected state not exposed | Tab to a swatch: expect "Navy, selected, radio button, 2 of 5" or similar | Partly: missing names on real controls; `<div>` swatches are invisible to the rule | Partly: names on native controls only |
| 2.1.1 Keyboard (A) | Swatches built from `<div>` or `<span>` that cannot be reached by Tab or arrow keys | Choose every option with the keyboard only | No | No |
| 1.4.1 Use of Color, 1.3.1 (A) | "Unavailable" shown only by a strike line or grey colour | Listen for "unavailable" or "sold out" on each option | No | No |
| 3.2.2 On Input (A) | Choosing an option reloads the page or moves focus to the top | Change an option with the keyboard; focus should stay put | No | No |
| 4.1.3 Status Messages (AA) | New price, stock and button state not announced after a change | Change an option with VoiceOver on; listen | No | No |
| 1.4.11 Non-text Contrast (AA) | Selected-swatch ring or option borders under 3:1 | Contrast checker | No | No |
| 2.5.8 Target Size (Minimum) (AA) | Swatches under 24 by 24 CSS pixels and tightly packed | Measure in dev tools | Partly: rule off by default | No |

Dawn's picker uses `<fieldset>` and `<legend>` for swatches and pill buttons, a labelled `<select>` for dropdowns, hidden text for each swatch's value and hidden text for unavailable options [S7] (opened). Variant pickers are on the roadmap's "Not in v1" list. Vendor audits report that swatch apps and custom pickers are where this part most often breaks [S12] (via search, not opened; not verified by us).

## Cart drawer

| Criterion | What fails in typical themes | How to check | Automated? | In v1? |
|---|---|---|---|---|
| 4.1.2 Name, Role, Value (A) | Drawer is a plain `<div>` with no dialog role or name; close button unnamed | Open the drawer: expect "Your cart, dialog" or similar | Partly: `button-name` for the close button; the dialog name is a best-practice rule | Yes for the close button name |
| 2.4.3 Focus Order (A) | Focus stays on "Add to cart" behind the drawer; focus is lost on close | Add to cart with the keyboard, press Tab: focus should be in the drawer. Escape: back to the trigger | No | No |
| 2.1.1, 2.1.2 (A) | Escape does not close; Tab wanders to the page behind the overlay | Use only the keyboard | No | No |
| 4.1.3 Status Messages (AA) | Quantity change, item removed and new total are not announced | Change a quantity with VoiceOver on; listen | No | No |
| 1.3.1, 3.3.2, 4.1.2 (A) | Line-item quantity fields with no label, or the same label on every line | Rotor Form Controls: each should name its product | Partly: missing labels only, not duplicates | Yes for missing labels |
| 2.4.4 Link Purpose (A) | "Remove" links with no product name; image and title links repeated | Rotor Links list: each name should make sense alone | Partly: empty links only | Yes for empty links |
| 1.4.3 Contrast (Minimum) (AA) | Free-shipping bar text, discount text, small grey totals | axe scan | Yes | Yes for theme colours |
| 2.4.11 Focus Not Obscured (Minimum) (AA) | Sticky checkout footer inside the drawer covers focused line items | Tab through a long cart | No | No |
| 1.4.10 Reflow (AA) | Drawer unusable at 400% zoom | 1280 px window at 400% | No | No |

Dawn's cart drawer has `role="dialog"`, `aria-modal="true"`, a name, named close buttons, hidden live regions with `role="status"`, quantity labels that include the product title and "Remove" buttons that name the item [S7] (opened). Upsell and cart apps often inject their own markup here. Keyboard traps in drawers are on the roadmap's "Not in v1" list.

## Footer

| Criterion | What fails in typical themes | How to check | Automated? | In v1? |
|---|---|---|---|---|
| 1.3.1, 3.3.2, 4.1.2 (A) | Newsletter email field with a placeholder and no label | Rotor Form Controls; type in the field and see whether the hint remains | Partly: a placeholder passes `label` | Yes |
| 1.3.5 Identify Input Purpose (AA) | Email field without `autocomplete="email"` | Inspect the input | Partly: `autocomplete-valid` checks values, not absence | No |
| 3.3.1 Error Identification (A) | "Invalid email" shown in red but not announced or linked to the field | Submit a bad address with VoiceOver on | No | No |
| 4.1.3 Status Messages (AA) | "Thanks for subscribing" not announced | Submit a good address with VoiceOver on | No | No |
| 2.4.4, 4.1.2 (A) | Social icon links with no text; payment icons with no text alternative | Rotor Links and Images lists | Yes: `link-name`, `svg-img-alt` | Yes |
| 1.4.3 Contrast (Minimum) (AA) | Small grey text on dark footers; copyright line | axe scan | Yes | Yes for theme colours |
| 4.1.2 (A) | Country, currency and language selectors with no name or state | Rotor Form Controls | Partly | Yes for missing names |
| 3.2.6 Consistent Help (A, new in 2.2) | Contact link or chat widget moves between pages | Compare footer and widget order on home, product and cart pages | No | No |
| 2.5.8 Target Size (Minimum) (AA) | Small social and policy links packed tightly | Measure in dev tools | Partly: rule off by default | No |

Dawn's newsletter field has a `<label>`, `aria-required`, `aria-invalid` and `aria-describedby` for its error and success messages [S7] (opened).

## Across every page

| Criterion | What fails in typical themes | How to check | Automated? | In v1? |
|---|---|---|---|---|
| 3.1.1 Language of Page (A) | No `lang`, or `lang="en"` hard-coded on a store translated into other languages | Inspect `<html>` on each language version | Partly: missing or invalid only, not wrong | Yes |
| 2.4.2 Page Titled (A) | Duplicate or empty page titles from custom templates | Check the tab title on key pages | Yes: `document-title` (empty only) | No |
| 1.4.4 Resize Text, 1.4.10 Reflow, 1.4.12 Text Spacing (AA) | Text cut off at 200% or 400% zoom; fixed-height boxes | Zoom to 200% and 400%; apply a text-spacing bookmarklet | Partly: `meta-viewport` (zoom blocked), `avoid-inline-spacing` | No |
| 2.2.2 Pause, Stop, Hide (A) | Home page slideshows that auto-rotate with no pause | Watch the hero for 5 seconds | No | No (carousels are out of v1) |
| 1.4.5 Images of Text (AA), 1.1.1 | Hero banners with sale text baked into the image | Look for text inside images | No | No (content) |
| 2.4.11, 2.1.1 (AA, A) | Cookie banners, chat bubbles and pop-ups from apps that cover focus or trap it | Tab through each page with the widgets present | No | No (third-party apps) |
| 3.3.8 Accessible Authentication (Minimum) (AA, new in 2.2) | Customer login that needs a puzzle CAPTCHA or blocks paste into password fields | Try signing in with a password manager | No | No (unverified whether Shopify's own CAPTCHA passes) |

## What v1 fixes and what it does not

| v1 fixes | Where | Limits |
|---|---|---|
| Low-contrast text | Theme colour tokens and CSS | Not text over photos, not colours inside apps |
| Missing alt text | Product media through the Admin API | AI drafts, the merchant approves; meaning is the merchant's call |
| Missing form labels | Theme Liquid: search, newsletter, contact, quantity | Labels only; error and success announcements are not covered |
| Empty links | Theme Liquid: logo, social, cart, account icons | Names only; vague text such as "Read more" is not covered |
| Empty buttons | Theme Liquid: menu, close, quantity, slider controls | Names only; no change to focus or keyboard behaviour |
| Missing page language | Theme layout file | Sets the store locale; mixed-language content is not covered |
| Regressions in the six types | Re-scan after theme publish or app install | Detects new axe findings only |

| v1 does not fix | Why |
|---|---|
| Keyboard access, focus order and focus traps in drawers and modals | On the roadmap's "Not in v1" list |
| Carousels and auto-rotating content | "Not in v1" |
| Variant picker structure and behaviour | "Not in v1" |
| Status messages (4.1.3), error handling (3.3.1) | Behaviour change, not a label or name |
| Focus visibility, target size, reflow, text spacing | Visual and layout work per theme; out of v1 scope |
| Third-party app widgets: reviews, chat, pop-ups, cookie banners, swatch apps | "Not in v1"; app fix packs are an M8 option |
| Shopify checkout and express payment buttons | Hosted by Shopify; themes cannot edit them |
| Videos, PDFs, images of text, content meaning | Merchant content, not theme code |

What this means for the product and for claims (D-06): v1 can say how many detected issues of six types it fixed and what it keeps watching. It cannot say a store meets WCAG 2.2 AA. Even a store with zero axe findings has untested criteria, and WCAG's "complete processes" rule ties every product page to Shopify's checkout [S1] (opened).

## Open items for M2 and M3

1. Census: which themes and apps produce each failure, and how often variant pickers and cart drawers break outside Dawn.
2. Spike B: confirm each fixer on Dawn 16 and Horizon 4.2, and decide whether the `label` fixer should also replace placeholder-only fields that pass axe.
3. Spike C: confirm what Dawn and Horizon output for images with no alt text on a live store.
4. Scanner setup: run axe with WCAG 2.2 tags and turn on `target-size` explicitly, or say in reports that target size is not tested.

## Sources

Checked 2026-10-08. "Opened" means we fetched the file and read it. Most sites were blocked from this container (WebFetch could not resolve hosts and the proxy refused w3.org, webaim.org and others), so many sources are search summaries only.

- S1. W3C, WCAG 2.2 source in W3C's own repository, main branch: `guidelines/index.html` (conformance requirements, "Full pages", "Complete processes", partial conformance) and the files under `guidelines/sc/20`, `sc/21` and `sc/22` for criteria 1.4.3, 1.4.11, 2.4.4, 4.1.2, 2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7 and 3.3.8. https://github.com/w3c/wcag (opened through raw.githubusercontent.com). This is the editors' source; the published Recommendation is https://www.w3.org/TR/WCAG22/ (not opened). The 31 A and 24 AA counts are ours, from WCAG 2.1's 30 A and 20 AA, minus 4.1.1, plus the six new A and AA criteria in 2.2.
- S2. W3C WAI, "What's New in WCAG 2.2", page source dated 2023-10-05. https://github.com/w3c/wai-website/blob/main/pages/standards-guidelines/wcag/new-in-22.md (opened). Published at https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ (not opened).
- S3. W3C, WCAG 2 FAQ (4.1.1 obsolete and removed in 2.2), https://www.w3.org/WAI/standards-guidelines/wcag/faq/ ; WCAG 2.2 Recommendation of 2023-10-05, https://www.w3.org/TR/2023/REC-WCAG22-20231005/ ; update of 2024-12-12, https://www.w3.org/TR/2024/REC-WCAG22-20241212/ (via search, not opened).
- S4. Deque, axe-core 4.14.0 rule list, `doc/rule-descriptions.md`, and rule files `lib/rules/label.json` (accepts `non-empty-placeholder`), `lib/rules/image-alt.json` and `lib/rules/target-size.json` (`"enabled": false`). https://github.com/dequelabs/axe-core (opened). Coverage counts (17 criteria with failure rules, 4 with review-only rules) are ours, from the WCAG tags in that list, excluding AAA and best-practice rules.
- S5. WebAIM, "The WebAIM Million: 2026", https://webaim.org/projects/million/ (via search, not opened; blocked). Figures as reported by https://prioritypixels.co.uk/insights/web-accessibility-is-getting-worse-according-to-the-2026-webaim-million-report/ and https://www.nexerdigital.com/news-and-thoughts/the-webaim-million-report-2026-what-it-tells-us (via search, not opened). Check against WebAIM before quoting externally.
- S6. Shopify home pages averaging 75.1 errors (sample of 42,516): https://www.pandacodegen.com/blog/web-accessibility-statistics-2026 and https://appifycommerce.com/blog/shopify-accessibility-errors-webaim-2026-fix-wcag-compliance/ (via search, not opened; vendor sources quoting WebAIM; unverified against WebAIM).
- S7. Shopify, Dawn theme 16.0.0 source: `layout/theme.liquid`, `sections/header.liquid`, `snippets/header-drawer.liquid`, `snippets/cart-drawer.liquid`, `snippets/product-variant-picker.liquid`, `snippets/product-variant-options.liquid`, `snippets/price.liquid`, `snippets/quantity-input.liquid`, `snippets/card-product.liquid`, `sections/main-product.liquid`, `sections/footer.liquid`, `config/settings_schema.json`. https://github.com/Shopify/dawn (opened). Code, not a live store; behaviour still needs a keyboard and screen-reader check.
- S8. Shopify, Horizon theme 4.2.0, `README.md` and `config/settings_schema.json`. https://github.com/Shopify/horizon (opened).
- S9. Shopify Partners, "Theme Store accessibility requirements" (Lighthouse accessibility average of 90 or more; keyboard-only workflows; drawers move focus and close with Escape), https://www.shopify.com/partners/blog/theme-store-accessibility-requirements (via search, not opened; may be dated).
- S10. Deque, "Automated testing study identifies 57 percent of digital accessibility issues", https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues ; Adrian Roselli, "What Does X% of Issues Mean?", https://adrianroselli.com/2022/07/what-does-x-of-issues-mean.html (via search, not opened).
- S11. EN 301 549 V4.1.1 adopting WCAG 2.2: National Disability Authority (Ireland), https://nda.ie/news/en301549-published ; Deque, https://www.deque.com/blog/en-301-549-v4-1-1-is-final-what-changed-what-it-means-and-what-you-should-do/ (via search, not opened).
- S12. Vendor audit reports of Dawn and Shopify themes (variant pickers, cart drawers, live regions): https://testparty.ai/blog/shopify-dawn-theme-accessibility , https://cartcoders.com/blog/accessibility/shopify-accessibility-audit-checklist/ (via search, not opened; vendors selling remediation; used only as "reported", never as fact).
- S13. Nic Chan, "Usability Testing Popular Shopify Themes" (32 themes, NVDA and keyboard-only), https://www.nicchan.me/blog/usability-testing-popular-shopify-themes/ (via search, not opened; results section not seen).
