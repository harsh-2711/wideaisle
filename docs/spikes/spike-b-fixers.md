# Spike B: six fixers on Dawn

Result: rule-based fixers clear all six failure types on a rendered test theme, make only two changes to stock Dawn 16 (both real gaps), and add no Theme Check offenses. The live before-and-after scan on a dev store waits on Q-03.

## What was built

| Part | Where | What it does |
|---|---|---|
| Liquid tag scanner | `app/lib/fixers/liquid-html.ts` | Finds HTML tags inside Liquid, skipping comments, schema, scripts and styles, and handling Liquid inside attributes |
| Name inference | `app/lib/fixers/names.ts` | Names icon-only links, buttons and fields from icon names, destinations and field names; uses the theme's translation keys when they exist |
| Six fixers | `app/lib/fixers/fixers.ts` | Low contrast (colour settings), missing alt, missing labels, empty links, empty buttons, missing page language |
| Engine | `app/lib/fixers/engine.ts` | Runs every fixer on every file, chains them, and supports apply and exact revert |
| Contrast maths | `app/lib/fixers/color.ts` | WCAG contrast ratio and the smallest lightness change that reaches 4.5:1, keeping hue |

Every fixer only adds attributes or changes colour values. None removes merchant content. Each is idempotent. When a fixer cannot name something safely, it makes no change and lists it for review.

## Results

| Check | Result |
|---|---|
| Mini test theme rendered with LiquidJS, axe before | All six types present |
| Same theme after the fixers, axe | Zero findings of the six types |
| Stock Dawn 16.0.0 | 2 changes, both real gaps (below), 0 items for review |
| Fixers run twice on Dawn | Second run changes nothing |
| Theme Check on Dawn, before and after | No check has more offenses after |

The two Dawn 16 gaps:

1. `sections/main-cart-items.liquid` line 240: an icon-only info button, shown when quantity rules apply, has no accessible name. The fixer names it "More information".
2. `sections/main-password-header.liquid` line 64: the password field's label points at translated text instead of the field's id, so the field has no label. The fixer labels it from its placeholder.

Stock Dawn's colour schemes all pass 4.5:1. Real failures will come from merchant colour choices, missing alt text in the admin, apps and older theme versions. The census (T-020) measures which matter most.

## Limits

- Rendering uses LiquidJS with stand-ins for Shopify objects and filters, not Shopify itself. The dev-store scan (needs Q-03) is the real test.
- No visual diff yet: it needs a rendered store. Only contrast changes affect looks, and the merchant previews them first (M4).
- The contrast fixer changes foreground colours only and leaves backgrounds and brand buttons alone. Gradients and images behind text are not handled.
- The alt fixer adds the `alt` attribute from the image object. Products with no alt text in the admin still render empty alt; Spike C drafts that content.
- Names from plain English are used when the theme has no matching translation key. Multilingual stores need translations (M4).

## Next

1. Dev store with Dawn (Q-03): render, scan before and after, take screenshots.
2. Run the fixers on the top themes from the census.
3. Contract work for M4: turn `Patch` into the shared schema.
