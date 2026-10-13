# Handoff: T-027 Census prefetch

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. Store pages cannot make the census browser fetch store URLs outside robots.txt and the 2 s gap: link prefetch, link prerender and speculation rules

## Status

Running. Last updated 2026-10-13.

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

## Current step

Running every check before the PR.

## Next three steps

1. Lint, typecheck, `npm test`; the full Playwright suite on both builds; the redirect spec with `--repeat-each 20`; the four rule checks; `lint-handoff --all`; commitlint.
2. Push, open the PR with the evidence below, set the board to In review.
3. Report the PR link, head, which vectors are blocked on each build, and the checks. Do not merge.

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
