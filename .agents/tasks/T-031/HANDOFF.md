# Handoff: T-031 Spike B: six fixers on Dawn

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Rule-based Liquid and CSS patches for the six failure types on Dawn, checked by axe before and after, with Theme Check passing.

## Status

In review. Three of four exit criteria pass. The live golden-store scan waits on Q-03 (dev store). Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| Liquid tag scanner and name inference | 88e747f |
| Six fixers, engine, contrast maths; test theme and Dawn 16 runs | 99350a2 |
| Escape values copied into attributes | 887f510 |

## Current step

Pull request review, then merge.

## Next three steps

1. After merge, set the state to Blocked on you with needs Q-03.
2. With a dev store: render Dawn, scan before and after, take screenshots (docs/spikes/spike-b-fixers.md, "Next").
3. Run the fixers on the top themes the census finds (T-020, T-021).

## Blockers and open questions

- Q-03: Partner account and dev stores for the live scan.

## Decisions used

D-08, D-11

## Files touched

- app/lib/fixers/: types.ts, color.ts, liquid-html.ts, names.ts, fixers.ts, engine.ts
- tests/unit/fixers.test.ts, tests/a11y/render.ts, tests/a11y/fixers.spec.ts, tests/a11y/themes/mini/
- tests/integration/dawn.test.ts, docs/spikes/spike-b-fixers.md, package.json (test:unit, test:integration)

## How to verify

```bash
npx vitest run tests/unit/fixers.test.ts
npx vitest run tests/integration/dawn.test.ts   # clones Dawn at a pinned commit
PW_CHROMIUM_PATH=/path/to/chrome npx playwright test tests/a11y/fixers.spec.ts
```

## Lessons and gotchas

- axe treats a placeholder as a label, so fixtures that test missing labels must drop it.
- Dawn hides decorative links with aria-hidden; the empty-link fixer skips them.
- Values copied into attributes must be escaped (attrSafe), or a translation with a quote breaks the tag.
