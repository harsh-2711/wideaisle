# 0003. Theme fix library

Status: Proposed
Date: 2026-10-11
Decisions used: D-08, D-11

## Context

Fixes are rules written once per theme and applied to every store on it (roadmap, "Product"). v1 covers the top 5 census themes (D-08). AI helps only offline, to author fixers (D-11).

Spike B (T-031, merged in PR #35) built six rule fixers. Sources: `docs/spikes/spike-b-fixers.md` and `app/lib/fixers/`.

- **Interface.** `Fixer { id, type, fixFile(path, content, ctx) }` returns a `Patch` or null (`app/lib/fixers/types.ts`). A patch holds the whole file `before` and `after`, the failure `type`, the `fixer` id and plain-word `notes`. Fixers read no files and make no network calls.
- **Behaviour.** Fixers only add attributes or change colour values, and never remove merchant content. Each is idempotent. When a fixer cannot name something safely, it changes nothing and adds a note that starts with "Needs review".
- **Engine.** `fixTheme` runs every fixer on every file and chains fixers on one file. `revertFixes` restores a file only if it still holds exactly what the fix wrote (`app/lib/fixers/engine.ts`).
- **Results.** On a small test theme rendered with LiquidJS, axe-core finds no failures of the six types after the fixers run. On stock Dawn 16.0.0 they make two changes, both real gaps, and flag one colour scheme for review: 70% opacity text measures 4.43:1, and no colour setting can fix it. A second run changes nothing. Theme Check shows no check with more offenses after.
- **Theme knowledge today.** A regex flags Dawn-family themes so the contrast fixer measures text at Dawn's opacities (1, 0.75, 0.7). Link and button names come from the theme's English locale file when it has a matching key.
- **Gaps.** A patch records the fixer id but no version. Review items are strings. LiquidJS rendering uses stand-ins for Shopify objects. There is no visual diff yet, since that needs a dev store (Q-03). Only Dawn has been tested, because the census has not run.
- **Theme identity.** The scanner reads each storefront's theme `schema_name`, `schema_version` and `theme_store_id` (`app/lib/scanner/detect.ts`).
- **Tests today.** Fixer unit tests (`tests/unit/fixers.test.ts`, `fixers-review.test.ts`, `fixers-dawn.test.ts`, `contrast.test.ts`), a pinned Dawn source (`tests/integration/dawn-source.ts`, Dawn 16.0.0 at commit 258f00f) and axe on rendered fixtures (`tests/a11y/fixers.spec.ts`).

## Decision

### Layout

- The six generic fixers stay in `app/lib/fixers/`.
- Each supported theme gets a profile in `app/lib/fixers/themes/<slug>/`. It contains:
  - how to match the theme: Theme Store id and schema name;
  - the tested version range;
  - theme facts: the text opacity table, translation keys and icon snippet names;
  - options for the generic fixers, or extra fixers for that theme;
  - fixture tests against a pinned copy of the theme's source.
- Dawn's opacity table moves into the Dawn profile. The regex stays as the fallback for Dawn forks.

### Which fixers run

| Store's theme | What runs |
|---|---|
| Profile exists, version in its tested range | All fixers, with the profile |
| Profile exists, version outside the range | All fixers, but every change is marked for review and the theme's profile is queued for an update |
| No profile | Scan and report only. No theme patches. Alt text still works (ADR 0004) |

### Versions

- Each fixer id gains a version, for example `empty-link/aria-label@1`. The version goes up when the fixer's output changes for any input in its tests.
- The library carries one version. At PoC that is the commit it was built from; later it becomes the package version, when the library ships as its own package (roadmap scale step 4).
- Every patch records the fixer id and version, the library version, and the theme name and version. The remediation log and the evidence pack show them.
- Revert never re-runs a fixer. It uses the stored delivery record (ADR 0002), so a new fixer version cannot change what a revert does.
- After a theme update, the rescan runs the current fixers on the new files. Files we already fixed give no patch, because fixers are idempotent. Files the update changed get new patches through the normal preview.

### Tests a fixer or profile must pass to merge

1. Unit tests for each fixer, with a case for each review note it can raise.
2. Idempotence: a second run changes nothing.
3. Exact revert: `revertFixes` restores every byte.
4. Theme fixture: the pinned theme source gives the expected list of patches and review items.
5. axe-core on the rendered fixture: no failures of the six types after the fixers run.
6. Theme Check: no check has more offenses after. Patches are checked with the Shopify AI Toolkit before commit (AGENTS.md).
7. From M4, needing Q-03: a golden dev store per supported theme, with before and after scans and a visual diff under the agreed threshold (lane G).

### Fixes that need review

- The M4 Fix schema replaces the "Needs review" string with a record: file, line, failure type, fixer id and version, reason, and any measured values.
- There are two kinds. "Not changed": the fixer could not fix it safely, for example a colour scheme where no shade passes. "Changed, please check": for example, an alt text taken from the admin, or a contrast change that affects looks.
- The app lists review items next to the patches, with the reason in plain words. They never block approval of the other patches.
- Items still open go into the evidence pack's known limitations.
- We count review items per theme and reason. The most common ones show which profile to improve next.

### Authoring a new theme

An agent drafts a profile, and any extra fixer, offline with Claude, working from the theme's source and the census patterns. It merges through the tests above and a reviewer agent, like any other code. No model runs when a store is fixed (D-11).

## Consequences

- **Cost: $0 a month extra.** Once a theme's fixers exist, fixing another store on it costs one scan and a few API writes (roadmap). Authoring uses the agent plan.
- **Easier.** Fixes are repeatable, tested and explainable. The evidence pack can name the rule and version behind every change.
- **Harder.** Each new theme needs a profile, a pinned source and fixtures, so coverage grows by hand (the D-11 risk). Tested version ranges need upkeep as themes release.
- **Contract changes in M4.** Patch gains version fields. Review items become records. The Fixer interface becomes async (ADR 0004). Each change is small now and costly once lanes build on the current shapes.
- **Risk: rendering.** LiquidJS with stand-ins is not Shopify. Only the dev store scan settles the results (Q-03).
- **Risk: names.** Names are English unless the theme has a matching translation key. Multilingual stores need translations (M4).
- **Risk: open follow-up from T-031.** The logo fix counts Liquid output such as `{{ shop.name }}` as visible text. Output can render empty, so an image that is a link's only name could get an empty alt. Check this on the dev store.
- **Risk: scope.** Fix packs for third-party apps, carousels, keyboard traps in drawers and modals, and variant pickers are outside v1 (D-08). Their failures show up in scans as items we do not fix.
