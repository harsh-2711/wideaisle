# 0002. Fix delivery path

Status: Proposed
Date: 2026-10-09
Decisions used: D-09

## Context

D-09 picks three routes: A, the Admin API, for pilots; C, a patched theme file, as the fallback; B, a GitHub pull request, for agencies. Every route must support preview and one-click revert. Alt text goes through the Admin API with no theme edit.

Spike A (T-030) built all three behind one interface. Sources: `docs/spikes/spike-a-delivery.md` and `app/lib/delivery/` on `claude/feat-delivery-adapters` (PR #41 at 72c6364). The PR is not merged; the owner merges it (Q-34).

- 83 offline tests pass against hand-written responses and a small fake store. Nothing has run against a real store (Q-03).
- Every route refuses a patch whose `before` differs from the store, and then writes nothing.
- The Admin API 2026-10 schema says every theme write needs `write_themes` plus an exemption from Shopify: `themeDuplicate`, `themeCreate`, `themeFilesUpsert`, `themeFilesDelete`, `themeDelete`. It does not say whether the app's distribution type changes that.
- Whether a custom-distribution app avoids the exemption is not confirmed. Shopify's docs (seen only via search) tie it to App Store apps. Community reports are mixed, and one denied request describes almost our use case.
- `productUpdateMedia` is deprecated in 2026-10. Its replacement, `fileUpdate`, needs `write_files` and no exemption.
- Shopify answers exemption requests in about two weeks (D-09).

## Decision

### One interface

`DeliveryAdapter` has `preview`, `apply` and `revert` (`app/lib/delivery/types.ts`). It takes a `DeliveryPatch`: theme file changes `{ file, before, after }`, where `before: null` creates a file, plus alt-text changes `{ productId, mediaId, before, after }`. Fixer output passes in as it is. `splitPatch` always sends alt text to route A.

| Store | Theme fixes | Alt text |
|---|---|---|
| Pilot | A: preview theme through the Admin API | A |
| Agency client with a GitHub-connected theme | B: pull request | A |
| A store where A is not allowed or not wanted | C: patched theme zip | A |

### The three routes, as built

- **A, Admin API.** Preview duplicates the live theme as an unpublished theme named "Wide Aisle preview <id>". It writes the patch there, reads every file back, compares bytes and returns a preview link. Apply writes to the live theme in batches of 50 files and reads every file back. If a write fails partway, it throws `PartialApplyError` with a receipt of everything it may have written.
- **B, GitHub pull request.** Preview compares git blob IDs on the connected branch and writes nothing. Apply creates a branch `wide-aisle/<id>-<suffix>` and opens a pull request. Whoever merges the pull request applies the fix.
- **C, patched theme file.** The merchant gives us their theme zip. We check every `before` and return a zip in which only the patched files change. The merchant uploads it as an unpublished theme, previews it and publishes it. The reader refuses unsafe archives, zips over 50 MB and contents over 300 MB.

### Receipts

Apply returns a receipt, and revert needs nothing else. Route A records, per file, the checksum that our own write returned (never one read later), plus any write jobs still running. Route B records the repository, connected branch, our branch and the pull request. Route C records the original zip's SHA-256.

We store every receipt in Postgres when apply returns, in the same transaction that marks the fix applied. That includes the receipt inside a `PartialApplyError`. Receipts are never edited; a revert adds its own record. The remediation log and the evidence pack read these records. The table is a data model change, so the owner approves it with the M4 contracts.

### Revert

- **A: one call.** It restores each file that still holds our write (our `after`, or the checksum our write returned) and deletes files we created. It skips files already at `before`. If any other file changed, or a write job is still running, it writes nothing. It ends in one of three ways: restored; refused with nothing written; or restored but `VERIFY_FAILED`, because Shopify rewrote the bytes on write.
- **B.** If the pull request is still open, revert closes it and deletes our branch (one call). If it was merged, revert opens a pull request that restores each file's original blob, and someone must merge it.
- **C.** The merchant republishes the old theme, which stays in their theme library, or uploads the original zip we return.

So one-click revert holds for route A and for an unmerged route B pull request. A merged route B pull request and route C each need one step by the merchant or agency.

### The exemption (Q-27)

- The App Store app needs the exemption for route A. The schema and the docs agree.
- For custom-distribution pilots, a dev store test settles it in minutes. Once Q-03 is done, an agent installs a custom-distribution app with `read_themes`, `write_themes`, `read_files` and `write_files`, then runs preview, apply and revert on Dawn with a one-line patch.
  - If it works, pilots use route A while the request for the App Store app is pending.
  - If it fails with `ACCESS_DENIED`, the owner files Q-27 at once. Pilots use routes B and C, with alt text on route A.
- Filing Q-27 before Q-03 is also reasonable, since the App Store app needs it either way. The owner picks the order.
- If Shopify says no, routes B and C still carry theme fixes, and alt text needs no exemption.

### What the dev store must confirm (Q-03)

Spike A lists 12 checks. These six could change this design:

1. A custom-distribution app can call the theme write mutations without the exemption.
2. `checksumMd5` is the MD5 of the stored bytes, and `themeFilesUpsert` returns it even when the write runs as a job. Revert depends on it.
3. Whether Shopify rewrites text files on write (line endings, byte order mark, JSON templates, `settings_data.json`). If it does, revert needs a compare that allows for it.
4. Whether two upsert jobs on one theme can finish out of order. If they can, stop resending an upsert after a 5xx and read the files back instead.
5. `fileUpdate` changes product image alt text with `write_files` only.
6. Route B: a merged pull request syncs to the theme, and a revert pull request syncs back. Route C: Shopify accepts our zip, and our reader accepts Shopify's export zip.

The spike doc lists the other six. They affect fixtures and limits, not the design.

## Consequences

- **Cost: $0 a month (D-09).** Routes A and C use Shopify's API and admin; route B uses the agency's own GitHub.
- **Easier.** The app and the fix engine do not care which route a store uses. A future AI fixer's output fits the same patch shape (ADR 0004).
- **Harder.** Three routes to test and support. Routes B and C give weaker revert, and the merchant does more work.
- **Scopes.** Route A needs `write_themes` and `write_files`. `shopify.app.toml` asks only for `read_themes`, and its comment says alt text adds `write_products`. Per Spike A that should be `write_files`. The M4 delivery and alt-text lanes change it.
- **Risk: no compare-and-swap.** `themeFilesUpsert` overwrites whatever is there. An edit that lands between our `before` check and our write is lost. The read-back catches edits that land after our write, and revert then refuses rather than overwrite them.
- **Risk: stale changes.** A route B pull request goes stale if the merchant edits in the theme editor before it is merged. A route C zip misses edits made after the merchant downloaded the theme.
- **Risk: the exemption.** It may be denied. It may also be granted per app ID, so each custom-distribution app could need its own.
- **Risk: billing.** One community reply says custom apps cannot use the Billing API (not verified). Pilots on a custom-distribution app may need another way to pay.
- **One-way door.** Any change that lets apply write to a live store is merged by the owner (AGENTS.md). That includes PR #41 (Q-34) and the M4 wiring.
