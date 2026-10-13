# Handoff: T-027 Census prefetch

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Store pages cannot make the census browser fetch store URLs outside robots.txt and the 2 s gap: link prefetch, link prerender and speculation rules

## Status

In review. PR #51 (https://github.com/harsh-2711/wideaisle/pull/51). Last updated 2026-10-13.

## Done so far

| Step | Commit |
|---|---|
| Branch cut from main at deb55fa (PR #50 merged); T-026 set Done | fafd5e1 |
| Task created | eea0a44 |
| Egress proxy close() ended open CONNECT tunnels; it hung after any HTTPS page | a164719 |
| Prefetch abort, NoStatePrefetchHoldback in a merged `--enable-features`, speculation rules taken out of main documents, init script for rules added later | 045ca91 |
| Census specs on `launchCensusBrowser` (worker fixture); `census-prefetch.spec.ts` | c4d9d66 |
| Drift check for `--enable-features` | bd48b84 |
| README line 8 and a dated line | 985339e |
| Evidence in this file; all checks green; PR #51 opened | 0fec63f |

## Current step

PR #51 open, waiting for a reviewer agent. Not merged: the lead merges or asks for it.

## Next three steps

1. Answer review comments on PR #51.
2. Once the lead says it merged, set the board to Done.
3. Open questions for the lead: iframes and a page's own fetch and XHR calls still load without a robots.txt check (README says so).

## Checks run before the PR (all passed)

- lint, typecheck, `npm test` (245 unit, 313 agent tests)
- full Playwright suite: 20 passed with the full binary, 20 with the headless shell 1194
- redirect spec `--repeat-each 20`: 20 of 20 on each build; prefetch and cache specs 5 times on 4 workers: 25 passed (full), prefetch 5 of 5 (shell)
- writing, claims, decisions and handoff checks; `lint-handoff --all`; commitlint from deb55fa

## Found on the way: HTTPS hung the census

Probing over HTTPS, `ctx.close()` never returned. The egress proxy's `close()` called `closeAllConnections()` and waited for every socket, but CONNECT tunnels leave the HTTP server's tracking and Chromium keeps them open. Every HTTPS page did this, with or without prefetch, so a census worker would have stopped after its first live store. The specs and the bench only used plain HTTP. Fixed in a164719, with a unit test that fails before the fix (proxy still open after 2 s); `census-prefetch.spec.ts` also closes a context after HTTPS pages.

## Evidence (Chromium 141, build 1194; HTTPS; robots.txt disallows /secret)

Probe: `scratchpad/t027/probe.mts` (not committed), one host per vector, 4 s on each page. Columns: /secret requests the store server saw.

| Vector | Before, full | Before, shell | After, full | After, shell | What stops it |
|---|---|---|---|---|---|
| `<link rel="prefetch">` | yes | yes | none | none | route handler aborts `Sec-Purpose: prefetch` |
| `<link rel="prerender">` | yes | no | none | none | `NoStatePrefetchHoldback` |
| inline rules, immediate and eager | yes | yes | none | none | HTML filter (inert type) |
| `Speculation-Rules` header | yes | yes | none | none | header dropped |
| rules built by script, with or without a supports check | yes | yes | none | none | init script: type setter and setAttribute |
| `document.write` of rules, plain and split | yes | yes | none | none | HTML filter (plain); init script observer (split) |
| `createContextualFragment` | yes | yes | none | none | init script observer |
| rules added 300 ms to 1.5 s after load | yes | yes | none | none | init script |
| rules inside an iframe | no | no | none | none | (never fired) |

- On the shell, "before" for split `document.write`, fragments and late rules comes from the spec's unprotected control context, which fetches each of them; the other rows come from probe runs of the unchanged census code.
- Inline rules fail with `PrefetchFailedNetError` if the test certificate is not trusted, which hides them. The probe and the spec trust only the test certificate's key.
- Prerender itself never ran: `PrerenderingDisabledByDevTools`.
- Init script variants, measured on the full binary: overriding `HTMLScriptElement.supports` stopped only rules behind a supports check. The MutationObserver alone stopped every case. The type and setAttribute patch alone missed `document.write` and fragments. Shipped: patch plus observer.
- `--enable-features`: with a later `--enable-features=WebXR`, `<link rel="prerender">` fetched /secret again; with `--enable-features=WebXR,NoStatePrefetchHoldback` it did not. So only the last switch counts, and ours repeats Playwright's `CDPScreenshotNewSurface`.
- Under tsx (`npm run census`), esbuild wrapped an inner arrow function of the init script in `__name(...)`, which the page lacks. The init script is therefore source text.

## Blockers and open questions

- Not covered, stated in the README: iframes on a page, and a page's own fetch and XHR calls, load without a robots.txt check.
- Playwright 1.64's default headless shell (build 1248) is not installed here; specs ran with the full binary and the headless shell build 1194 through `PW_CHROMIUM_PATH`.

## Decisions used

none

## Files touched

- app/lib/scanner/egress.ts (close ends tunnels), app/lib/scanner/speculation.ts (new)
- scripts/census/census.ts (route handler, main-document filter, init script, `--enable-features`, `extraArgs`)
- tests/unit/scanner/egress.test.ts, tests/unit/scanner/speculation.test.ts (new)
- tests/a11y/census-browser.ts (new fixture), census.spec.ts, census-cache.spec.ts, census-egress.spec.ts, census-prefetch.spec.ts (new)
- docs/census/README.md
- .agents/tasks/T-027/, .agents/tasks/T-026/ (set Done)

## How to verify

- `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test tests/a11y/census-prefetch.spec.ts`, and the same with `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`.
- With the init script line in `openScanContext` removed, the spec fails listing /secret/script, /secret/docwrite, /secret/fragment and /secret/late.
- `npx vitest run tests/unit/scanner`

## Lessons and gotchas

- The last `--disable-features` and the last `--enable-features` switch win in Chromium 141. Playwright puts its own first.
- Speculation-rules prefetches skip Playwright's route handler but still go through the context's proxy.
- `pkill -f` with a pattern that is also in your own command kills that command. Kill by pid.
- Playwright's `route.fetch` checks certificates with Node's CA list; `tls.setDefaultCACertificates` (Node 22.19+) adds a test certificate without turning checks off.
