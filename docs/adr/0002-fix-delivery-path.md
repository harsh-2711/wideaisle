# 0002. Fix delivery path

Status: Proposed
Date: 2026-10-11
Decisions used: D-09, D-12

## Context

D-09 picks three routes: A, the Admin API, for pilots; C, a patched theme file, as the fallback; B, a GitHub pull request, for agencies. Every route must support preview and one-click revert, and the M4 exit asks that revert works in one click. Alt text goes through the Admin API with no theme edit.

Spike A (T-030) built all three behind one interface. Sources: `docs/spikes/spike-a-delivery.md` and `app/lib/delivery/` on `claude/feat-delivery-adapters` (PR #41 at 72c6364). The PR is not merged; the owner merges it (Q-34).

- 83 offline tests pass against hand-written responses and a small fake store. Nothing has run against a real store (Q-03).
- Every route refuses a patch whose `before` differs from the store, and then writes nothing.
- The Admin API 2026-10 schema says every theme write needs `write_themes` plus an exemption from Shopify. It does not say whether the app's distribution type changes that. Whether a custom-distribution app avoids the exemption is not confirmed, and one denied request found by the spike describes almost our use case.
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

- **A, Admin API.** Preview duplicates the live theme as an unpublished theme named "Wide Aisle preview <id>", writes the patch there, reads every file back and returns a preview link. Apply writes to the live theme in batches of 50 files and reads every file back.
- **B, GitHub pull request.** Preview compares git blob IDs on the connected branch and writes nothing. Apply opens a pull request from a branch `wide-aisle/<id>-<suffix>`. Whoever merges it applies the fix.
- **C, patched theme file.** The merchant gives us their theme zip. We return a zip in which only the patched files change. The merchant uploads it as an unpublished theme, previews it and publishes it.

### Records: an intent before the first write, a receipt after

- **Intent.** Before the first write to a store or repository, the worker stores an intent row: patch id, route, store, theme or repository, and every file's `before` and `after` and every alt-text change. For route B it also stores the branch suffix, passed to the adapter's `suffix` option, so a retry knows the branch name. The same pattern guards alt-text batch submits (ADR 0004).
- **Receipt.** When apply returns, or throws `PartialApplyError` (which carries a receipt of everything it may have written), the worker completes that row with the route's receipt in the same transaction that marks the fix applied. Route A's receipt holds, per file, the checksum our own write returned, plus any write jobs still running. Route B's holds the repository, branches and pull request.
- **Route C zips.** Both zips, the merchant's and ours, go to object storage, up to 50 MB each. The Postgres row keeps their storage keys and SHA-256 hashes, not the bytes (ADR 0001, ADR 0005).
- **A retry finds an open intent.** If the worker dies mid-apply, pg-boss retries the job. Apply would refuse, since files already at `after` count as changed, so a retry never calls apply first.
  - Route B: look for an open or merged pull request from the stored branch. If one exists, complete the row with it. If the branch exists without one, delete our branch, then apply. Otherwise apply.
  - Route A: wait a set time for write jobs the dead worker may have started (their IDs are lost; Q-03 job timings set the wait). Then read every file and every alt-text value in the intent. An alt-text-only patch has no files, so its alt-text values decide:
    - all at `after`: complete the row;
    - all at `before`: apply;
    - a mix: revert from the intent, comparing bytes since no checksums were saved, then apply;
    - anything else: stop and flag the store for a person.
- Rows are never edited after they complete; a revert adds its own row. The remediation log and the evidence pack read them. The tables are a data model change, so the owner approves them with the M4 contracts.

### Revert

- **A: one call.** It restores each file that still holds our write (our `after`, or the checksum our write returned), deletes files we created and skips files already at `before`. If any other file changed, or a write job is still running, it writes nothing. It ends in one of four ways:
  1. restored;
  2. refused, with nothing written;
  3. an API error partway: the files restored so far stay restored, and a second revert finishes the rest;
  4. files written but `VERIFY_FAILED`, because Shopify rewrote the bytes on write. Revert stops there, so alt text is not restored.
- **B.** An open pull request is closed and our branch deleted, in one call. After a merge, revert opens a pull request that restores each file's original blob, and someone must merge it.
- **C.** The merchant republishes the old theme, which stays in their theme library, or uploads the original zip we return.

**This does not meet D-09 as written for two cases.** Route C and a merged route B pull request each need one step by the merchant or agency. One-call revert is built for route A and for an open route B pull request, not yet tried on a store (Q-03). Whether to accept a one-step merchant revert for the two cases, or require more work, is the owner's call (Q-35). Approving this ADR does not change D-09.

### The exemption (Q-27)

- The App Store app needs the exemption for route A. The schema and the docs agree.
- For custom-distribution pilots, a dev store test settles it after Q-03: a custom-distribution app with `read_themes`, `write_themes`, `read_files` and `write_files` previews, applies and reverts a one-line patch on Dawn. If that works, pilots use route A while the App Store request is pending. If it returns `ACCESS_DENIED`, the owner files Q-27 at once, and pilots use routes B and C.
- Filing Q-27 before Q-03 is also reasonable, since the App Store app needs it either way. The owner picks the order.
- If Shopify says no, routes B and C still carry theme fixes, and alt text needs no exemption.

### What the dev store must confirm (Q-03)

Spike A lists 12 checks. Seven of them, grouped as six here, could change this design:

1. A custom-distribution app can call the theme write mutations without the exemption.
2. `checksumMd5` is the MD5 of the stored bytes, and `themeFilesUpsert` returns it even when the write runs as a job. Every read checks bytes against it. Without it in the write response, revert falls back to comparing bytes.
3. Whether Shopify rewrites text files on write (line endings, byte order mark, JSON templates, `settings_data.json`). If it does, preview and apply stop with `VERIFY_FAILED`, and apply does so after it has written to the live theme. Revert already recognises our own files by checksum.
4. Whether two upsert jobs on one theme can finish out of order. If they can, stop resending an upsert after a 5xx and read the files back instead.
5. `fileUpdate` changes product image alt text with `write_files` only.
6. Route B: a merged pull request syncs to the theme, and a revert pull request syncs back. Route C: Shopify accepts our zip, and our reader accepts Shopify's export zip.

The spike doc lists the other five (its items 2, 3, 5, 6 and 11). They affect fixtures and limits, not the design.

## Consequences

- **Cost: $0 a month (D-09).** Routes A and C use Shopify; route B uses the agency's own GitHub. Route C zips add to object storage (ADR 0005).
- **Easier and harder.** The app and the fix engine do not care which route a store uses, and a future AI fixer's output fits the same patch (ADR 0004). But there are three routes to test, and B and C give weaker revert and more merchant work.
- **Scopes.** Route A needs `write_themes` and `write_files`. `shopify.app.toml` asks only for `read_themes`, and its comment names `write_products` for alt text where Spike A says `write_files`. The M4 lanes fix it.
- **Risk: no compare-and-swap.** `themeFilesUpsert` overwrites whatever is there. An edit that lands between our `before` check and our write is lost. The read-back catches edits that land after our write, and revert then refuses rather than overwrite them.
- **Risk: stale changes.** A route B pull request goes stale if the merchant edits in the theme editor before it is merged. A route C zip misses edits made after the merchant downloaded the theme.
- **Risk: the exemption.** It may be denied. It may be granted per app ID, so each custom-distribution app could need its own.
- **Risk: billing.** D-12 says billing goes through the Shopify Billing API only. One community reply, not verified, says custom-distribution apps cannot use it. The owner decides how pilots pay (Q-36).
- **One-way door.** Any change that lets apply write to a live store is merged by the owner (AGENTS.md). That includes PR #41 (Q-34) and the M4 wiring.
