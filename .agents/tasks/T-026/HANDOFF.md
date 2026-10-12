# Handoff: T-026 Census test egress

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Census tests and scans reach no host but the store and its assets: no real DNS in tests, no Chromium background traffic

## Status

In review. PR #50 (https://github.com/harsh-2711/wideaisle/pull/50). Last updated 2026-10-12.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at 4e0d210 (PR #49 merged); T-025 set Done | 895d9ed |
| Task created | 3c9614c |
| `--disable-features` check on Chromium 141: a second switch replaces the first (evidence below) | (scratch script, not committed) |
| (a) census spec clients resolve nothing; `cdn.shopify.com` in `blockedHosts` | b2b3af9 |
| (b) `launchCensusBrowser`: merged feature list, new switches, refusing launch-level proxy; bench uses it; `tests/a11y/census-egress.spec.ts` | 99f586e |
| Census README rule line; evidence in this file; exit criteria ticked | d049855 |
| All checks green; PR #50 opened | d049855 |

## Current step

PR #50 open, waiting for a reviewer agent. Not merged: the lead merges or asks for it.

## Next three steps

1. Answer review comments on PR #50.
2. Once the lead says it merged, set the board to Done.
3. Possible follow-up for the lead: Shopify themes can ship speculation rules, which make Chromium prefetch other store pages outside the PoliteClient gap. Not checked here.

## Checks run before the PR (all passed)

- lint, typecheck, `npm test` (238 unit, 313 agent tests)
- census, census-cache, census-egress and bench specs: 10 passed with the full chrome binary, 10 with the headless shell 1194; full suite 19 passed; egress and cache specs 4 times on 4 workers, 24 passed
- writing, claims, decisions and handoff checks; `lint-handoff --all`; commitlint from 4e0d210

## Evidence: a second --disable-features replaces the first

A page on `http://127.0.0.1` (a secure context) reads `typeof navigator.xr` (feature WebXR) and `typeof IdentityCredential` (feature FedCm). Same result on the full chrome binary and the headless shell, both build 1194 (Chromium 141):

| Extra args | navigator.xr | IdentityCredential |
|---|---|---|
| none | object | function |
| `--disable-features=WebXR` | undefined | function |
| `--disable-features=FedCm` | object | undefined |
| `--disable-features=FedCm` then `--disable-features=WebXR` | undefined | function |
| `--disable-features=FedCm,WebXR` | undefined | undefined |

The browser's real command line (`/proc/<pid>/cmdline`) has Playwright's `--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,...` at argv 15 (full) or 18 (shell), and the user's switches at the end. So a user `--disable-features` would drop Playwright's 17 features. The census switch repeats them.

## Evidence: what a scan sent before the change

Full chrome binary, a store page with a checkout form, today's census flags, a recording proxy at launch:

- Through the store's egress proxy: `content-autofill.googleapis.com/v1/pages/...` (autofill query).
- Outside any store context, so it would have gone out directly: `accounts.google.com/ListAccounts?source=ChromiumBrowser` (sign-in check) and `android.clients.google.com/checkin` (push-service check-in). Typing into a field also fetched a spell-check dictionary from `redirector.gvt1.com`; the census never types.
- `--allow-browser-signin=false` did not stop the sign-in check, so a launch-level proxy that refuses everything handles the browser-wide traffic.
- The headless shell build 1194 sent none of these.

## Design

- `launchCensusBrowser(executablePath)` in `scripts/census/census.ts` launches with `CENSUS_CHROMIUM_ARGS` and `proxy: { server: <refusing proxy> }`. The refusing proxy is `startEgressProxy({ ports: [] })`: no port is allowed, so it refuses every request before any DNS lookup, and records the host in `refused`.
- Store contexts keep their own egress proxy (`openScanContext`), which overrides the launch proxy.
- `CENSUS_CHROMIUM_ARGS`: the WebRTC switch as before, `--disable-domain-reliability`, `--no-pings`, and one `--disable-features` with `PLAYWRIGHT_DISABLED_FEATURES` plus `AutofillServerCommunication` and `OptimizationHintsFetching`.
- `scan()` and the bench's `runLevel` use the launcher. The bench's version probe still uses `chromium.launch`.

## Blockers and open questions

- Playwright 1.64's default headless shell (build 1248) is not installed in this cloud session. The specs ran with the full chrome binary and the installed headless shell build 1194, both through `PW_CHROMIUM_PATH`. No `playwright install` was run.

## Decisions used

none

## Files touched

- .agents/tasks/T-026/, .agents/tasks/T-025/ (set Done)
- scripts/census/census.ts (`PLAYWRIGHT_DISABLED_FEATURES`, `CENSUS_DISABLED_FEATURES`, `CENSUS_CHROMIUM_ARGS`, `launchCensusBrowser`, `scan()`)
- scripts/bench/scan-bench.ts (`runLevel` uses the launcher)
- tests/a11y/census.spec.ts (clients resolve nothing)
- tests/a11y/census-egress.spec.ts (new)
- docs/census/README.md (one rule line)

## How to verify

- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test tests/a11y/census-egress.spec.ts tests/a11y/census.spec.ts`
- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell npx playwright test tests/a11y/census-egress.spec.ts`
- With `AutofillServerCommunication` removed from `CENSUS_DISABLED_FEATURES`, the scan spec fails on the full binary with `content-autofill.googleapis.com` in the looked-up hosts.

## Lessons and gotchas

- The bash guard blocks `cat` with globs in task folders, loops with a variable command name, and `env -u`. Use plain commands; `PW_CHROMIUM_PATH=` unsets the path for one run.
- `about:blank` is not a secure context, so secure-context APIs are hidden there. Load a page from `http://127.0.0.1` to test them.
- The census specs use the Playwright config's `browser` fixture, which does not get the census flags. Only `census-egress.spec.ts` launches through `launchCensusBrowser`.
