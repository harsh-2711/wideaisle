# Handoff: T-021 Census analysis and gap report

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Failures by theme and by app; share inside the six types; what a theme patch, content edit or app change would fix.

## Status

In review. T-020 merged in harsh-2711/wideaisle#34 and main is merged in. The generator is tested on fixture data. The real report waits on the census run (T-020, Q-01, Q-02). Last updated 2026-10-08.

## Done so far

| Step | Commit |
|---|---|
| Gap report generator and `report` command | 162d1f1 |
| Crawler fixes merged in | 3abe4a3 |
| Review fixes: Theme Store names only, store-count floor, source unclear, app markers, coverage lines | 6358a58 |
| Review fixes: count shops, fold free-text versions, pickRecords keeps data | f5f52a0 |
| Review fixes: floor by brand, cut-off image URLs | 551c4f4 |

## Current step

Pull request review, then merge.

## Next three steps

1. Review and merge the pull request.
2. Set the state to Blocked on you with needs Q-01, Q-02 (through T-020).
3. After the census run: `npm run census -- report ...` (docs/census/README.md), commit docs/census/gap-report.md, and feed the top themes into D-08.

## Blockers and open questions

- The real report needs the census run: Q-01 (network) and Q-02 (contact address).

## Decisions used

D-08

## Files touched

- app/lib/census/report.ts, scripts/census/census.ts (report command), docs/census/README.md
- tests/unit/census-report.test.ts

## How to verify

```bash
npx vitest run tests/unit/census-report.test.ts
```

## Lessons and gotchas

- The source guess (theme, app, unknown) is a heuristic from selectors and markup. Treat app shares as a lower bound.
- Census output files can hold several lines per domain after retries. pickRecords keeps the last one with data.
- The report is public. It floors themes, versions and patterns by brand (the domain label left of the public suffix), not by domain or shop, and folds free-text version strings. A brand with differently named domains can still pass the floor, so check the real report by hand before committing it.
