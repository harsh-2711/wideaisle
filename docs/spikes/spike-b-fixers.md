# Spike B: six fixers on Dawn

Result: rule-based fixers clear all six failure types on a rendered test theme, make only two changes to stock Dawn 16 (both real gaps), flag one Dawn colour scheme for review, and add no new Theme Check offenses. The live before-and-after scan on a dev store waits on Q-03.

## What was built

| Part | Where | What it does |
|---|---|---|
| Liquid tag scanner | `app/lib/fixers/liquid-html.ts` | Finds HTML tags inside Liquid, skipping comments, doc blocks, schema, scripts and styles; reads attribute names and values with Liquid inside them |
| Name inference | `app/lib/fixers/names.ts` | Names icon-only links, buttons and fields from icon names, destinations and field names; uses the theme's translation keys when they exist |
| Six fixers | `app/lib/fixers/fixers.ts` | Low contrast (colour settings), missing alt, missing labels, empty links, empty buttons, missing page language |
| Engine | `app/lib/fixers/engine.ts` | Runs every fixer on every file, chains them, and supports apply and exact revert. Revert refuses a file edited since the fix |
| Contrast maths | `app/lib/fixers/color.ts` | WCAG contrast ratio, text drawn at an opacity over its background, and the smallest lightness change that reaches 4.5:1 on every background, keeping hue |
| JSON paths | `app/lib/fixers/json-text.ts` | Finds one value in settings_data.json by its key path, so a fix changes that value and no other byte |

Every fixer only adds attributes or changes colour values. None removes merchant content. Each is idempotent. When a fixer cannot name something safely, it makes no change and lists it for review. A value is copied into a new attribute only when its Liquid balances.

## Results

| Check | Result |
|---|---|
| Mini test theme rendered with LiquidJS, axe before | All six types present. Body text is drawn at 75% opacity and a subtitle at 70%, as in Dawn |
| Same theme after the fixers, axe | Zero findings of the six types. 1 item for review: the product image's alt comes from the admin |
| Stock Dawn 16.0.0 | 2 changes, both real gaps (below), 1 item for review (below) |
| Fixers run twice on Dawn | Second run changes nothing |
| Theme Check on Dawn, before and after | No check has more offenses after |

The two Dawn 16 gaps:

1. `sections/main-cart-items.liquid` line 240: an icon-only info button, shown when quantity rules apply, has no accessible name. The fixer names it "More information".
2. `sections/main-password-header.liquid` line 64: the password field's label points at translated text instead of the field's id, so the field has no label. The fixer labels it from its placeholder.

The item for review is `config/settings_data.json`, colour scheme 5: white text on #334FB4. Dawn draws body text at 75% opacity, which measures 4.83:1 and passes. Subtitles and unit prices are drawn at 70%, which measures 4.43:1. Even pure white cannot pass at 70% on that blue, so no colour setting fixes it; the background or the theme's CSS must change. Before the review fixes the contrast fixer measured solid colour only and missed this.

Stock Dawn's other colour schemes pass at every opacity Dawn uses for text. Real failures will come from merchant colour choices, missing alt text in the admin, apps and older theme versions. The census (T-020) measures which matter most.

## How the contrast fix measures text

Dawn draws text as `rgba(var(--color-foreground), alpha)`: headings at 1, body text, labels and menu items at 0.75 (`layout/theme.liquid`, `assets/base.css`), and subtitles, unit prices, predictive search headings and facet counts at 0.7. The fixer uses this table only for Dawn-family themes: those whose `layout/theme.liquid` or `assets/base.css` holds `rgba(var(--color-foreground), 0.75)`. Other themes are checked as solid colour, so a brand colour that passes as solid text is left alone. For Dawn-family themes the fixer measures each text colour over its background at 1, 0.75 and 0.7, and changes it only as much as needed for all three. 0.7 is the lowest opacity Dawn uses for text that must pass. When no shade reaches 4.5:1 at 0.7, the fixer still makes 0.75 text pass and flags the 0.7 text for review.

One setting can sit on several backgrounds. In older Dawn, `colors_text` is drawn on `colors_background_1` and `colors_background_2`. The fixer looks for one colour that passes on every background. If none exists, it changes nothing and flags it for review. Every note states ratios measured on the new file.

## Limits

- Rendering uses LiquidJS with stand-ins for Shopify objects and filters, not Shopify itself. The dev-store scan (needs Q-03) is the real test.
- No visual diff yet: it needs a rendered store. Only contrast changes affect looks, and the merchant previews them first (M4).
- The contrast fixer changes foreground colours only and leaves backgrounds and brand buttons alone. Gradients and images behind text are not handled.
- Text opacities are Dawn's, and only Dawn-family themes get them. Other themes may draw text at other opacities and are checked as solid colour until the census themes get their own table. Text Dawn draws below 0.7 (placeholders at 0.55, slider counters and facet help text at 0.5) cannot reach 4.5:1 on white with any colour, so a colour setting cannot fix it.
- Colours that are not 3- or 6-digit hex (rgba, 8-digit hex, names) are skipped.
- The alt fixer adds `alt` only from image objects (paths ending in image, featured_image, featured_media, media or preview_image). Other objects such as product or collection have no `.alt` and go to review. Every alt taken from the admin is also flagged: where the admin alt is empty, the image renders as decorative (`alt=""`). Spike C drafts that content.
- The shop name is used only for the shop's own logo or home link (settings.logo, header__heading-logo or header__heading-link, routes.root_url, href="/"). Other logos go to review. An image in a home link that always shows text gets `alt=""`, so the name is not read twice. Text inside `{% if %}` does not count, since it may render without the image.
- Names from plain English are used when the theme has no matching translation key, or when the key's text needs a variable (for example "Increase quantity for {{ product }}"). Multilingual stores need translations (M4).
- A link or button that renders a snippet other than an icon, or uses echo, liquid or section tags, counts as having text. An empty one of these is missed rather than named over.
- When an opening tag is split across `{% if %}` and `{% else %}`, only the last branch is checked. The others are listed for review.

## Next

1. Dev store with Dawn (Q-03): render, scan before and after, take screenshots.
2. Run the fixers on the top themes from the census.
3. Contract work for M4: turn `Patch` into the shared schema.
