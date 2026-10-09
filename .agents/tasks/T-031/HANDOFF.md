# Handoff: T-031 Spike B: six fixers on Dawn

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Rule-based Liquid and CSS patches for the six failure types on Dawn, checked by axe before and after, with no new Theme Check offenses.

## Status

Blocked on you. Merged in PR #35. Before and after scans wait on a dev store (Q-03).

## Done so far

| Step | Commit |
|---|---|
| Liquid tag scanner and name inference | 88e747f |
| Six fixers, engine, contrast maths; test theme and Dawn 16 runs | 99350a2 |
| Escape values copied into attributes | 887f510 |
| Review 1: theme walk skips .git; Dawn test fails under CI when Dawn is missing | a10d61d |
| Review 2, 9, 12 to 15: attribute parser, Liquid balance check, doc blocks, snippet text | 6a7ecd4 |
| Review 6 to 8, 10: alt only from image objects, shop-logo clues, icon-x, keys with variables | 16f3cac |
| Review 3 to 5: contrast at Dawn's text opacity, one colour per key, exact JSON paths | e318ca8 |
| Review 11, 16: Dawn excerpt tests, revert refuses edited files, spike doc | ac725af |
| Re-review A to E: quote check, Dawn opacity only for Dawn-family themes, split tags, home-link alt, Liquid attribute names | 6b19058 |
| Merge main (PR showed conflicted, so CI could not run); package.json keeps both scripts | b139d45 |

## Current step

Waiting for Q-03.

## Next three steps

1. With a dev store: render Dawn, scan before and after, take screenshots (docs/spikes/spike-b-fixers.md, "Next").
2. Run the fixers on the top themes the census finds (T-020, T-021).

## Blockers and open questions

- Q-03: Partner account and dev stores for the live scan.
- Follow-up from the PR #35 review (nit): `linkHasOtherText` in app/lib/fixers/fixers.ts counts Liquid output such as `{{ shop.name }}` as visible text. Output can render empty, so the logo fix may give an empty alt to an image that is the link's only name. Check this on the dev store; if it happens, treat output-only text like conditional text.

## Decisions used

D-08, D-11

## Files touched

- app/lib/fixers/: types.ts, color.ts, liquid-html.ts, names.ts, fixers.ts, engine.ts, json-text.ts
- tests/unit/fixers.test.ts, tests/a11y/render.ts, tests/a11y/fixers.spec.ts, tests/a11y/themes/mini/
- tests/integration/dawn.test.ts, tests/integration/dawn-source.ts, tests/unit/theme-source.test.ts
- tests/unit/fixers-review.test.ts, tests/unit/contrast.test.ts (regressions from the PR #35 review)
- tests/unit/fixers-dawn.test.ts, tests/unit/fixtures/dawn-16/ (verbatim Dawn 16 files)
- docs/spikes/spike-b-fixers.md, package.json (test:unit, test:integration)

## How to verify

```bash
npx vitest run tests/unit   # fixers, contrast, review regressions, Dawn excerpts
npx vitest run tests/integration/dawn.test.ts   # clones Dawn at a pinned commit
PW_CHROMIUM_PATH=/path/to/chrome npx playwright test tests/a11y/fixers.spec.ts
```

## Lessons and gotchas

- axe treats a placeholder as a label, so fixtures that test missing labels must drop it.
- Dawn hides decorative links with aria-hidden; the empty-link fixer skips them.
- Values copied into attributes must be escaped (attrSafe), or a translation with a quote breaks the tag.
- Copy an attribute value only when its Liquid balances (liquidBalanced). Read values with parseAttrs, never a regex.
- Every alt copied from an image object adds a review note: empty admin alt renders as decorative.
- Dawn draws text at 75% opacity (body) and 70% (subtitles). The contrast fixer solves for 70% and falls back to 75% with a review note. Dawn 16 scheme-5 fails at 70% (4.43:1) and no colour fixes it: one expected review item.
- The opacity table applies only when contextFor finds rgba(var(--color-foreground), 0.75) in layout/theme.liquid or assets/base.css (ctx.dawnTextOpacity). Unit tests of Dawn behaviour pass that flag.
- A Liquid part that holds both quote kinds is never copied: attrSafe would turn " into ' and break it.
- revertFixes returns { theme, refused }: a file edited since the fix is not reverted.
- A conflicted PR gets no CI run. Check mergeable_state after pushing.
- loadTheme reads theme folders only. Walking .git failed in CI when git removed a lock file mid-walk.
