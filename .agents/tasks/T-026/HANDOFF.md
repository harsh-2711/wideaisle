# Handoff: T-026 Census test egress

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Census tests and scans reach no host but the store and its assets: no real DNS in tests, no Chromium background traffic

## Status

Running. Last updated 2026-10-12.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at 4e0d210 (PR #49 merged); T-025 set Done | 895d9ed |
| Task created | (this checkpoint) |

## Current step

Checking on Chromium 141 whether a second `--disable-features` replaces Playwright's own list.

## Next three steps

1. Prove the `--disable-features` behaviour with a script against both binaries, and keep the output for the PR.
2. Add a shared census launcher in `scripts/census/census.ts` with the background-traffic flags (merged into Playwright's list if needed); use it in `scan()` and `scripts/bench/scan-bench.ts` (approved by the lead).
3. Fix `tests/a11y/census.spec.ts` (no real DNS, `cdn.shopify.com` in `blockedHosts`) and add the no-background-traffic spec; run it with the full chrome binary and the headless shell.

## Plan (from T-025)

- (a) `tests/a11y/census.spec.ts`: the clients at lines 37 and 151 use system DNS. Give both `lookup: async () => []`. Assert the first spec's record has `blockedHosts` containing `cdn.shopify.com`.
- (b) Launch sites: `scan()` in `scripts/census/census.ts` and `runLevel` in `scripts/bench/scan-bench.ts`. The Playwright specs use the config's `browser` fixture, which lacks the census's launch args, so the new spec launches through the census helper.
- Playwright 1.64 already passes `--disable-background-networking`, `--disable-component-update`, `--disable-sync`, `--disable-default-apps`, `--disable-client-side-phishing-detection`, `--metrics-recording-only`, `--no-first-run`, and `--disable-features=` with its own list. It appends user args after its own.
- Present in the installed Chromium 141 binary: `AutofillServerCommunication`, `OptimizationHintsFetching`, `--disable-domain-reliability`, `--no-pings`. The headless shell (`chromium_headless_shell-1194`) has no autofill feature.

## Blockers and open questions

- None yet.

## Decisions used

none

## Files touched

- .agents/tasks/T-026/
- .agents/tasks/T-025/ (set Done)

## How to verify

- (filled in as the work lands)

## Lessons and gotchas

- The bash guard blocks `cat` with globs in task folders, and loops with a variable command name. Use plain commands.
