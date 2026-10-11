# 0004. AI in the product

Status: Proposed
Date: 2026-10-09
Decisions used: D-06, D-11, D-12, D-14

## Context

D-11, as changed by the owner: start with option A, and keep the design open for B. Under A, AI is used offline to author fixers per theme, and a Haiku model drafts alt text in batch. Under B, AI would generate fixes live. The fix engine must accept a live AI fixer later without a rewrite. In v1, no model sits on the hot path except alt text in batch.

Missing alt text is on 53.1% of the top million home pages (WebAIM Million 2026, quoted in the roadmap).

Spike C (T-032, merged in PR #39) built the alt-text pipeline. Sources: `docs/spikes/spike-c-alt-text.md`, `app/lib/alt-text/` and `scripts/alt-text/`. It is tested only with a mocked SDK. Nothing has called the real API (Q-04).

- **Flow.** Inputs are validated and de-duplicated, and caps are checked before anything is sent. The batch is sent with SDK retries off, since the endpoint takes no idempotency key. Results are parsed and checked into a review queue, a retry list and a failed list.
- **Run state.** An append-only log (`data/alt-text/<run>/state.jsonl`) records an intent before each submit and the batch ID after it. A resume never submits the same images twice.
- **Images.** Images go as URLs. The Shopify CDN is asked for a 512 px copy, which is about 361 image tokens.
- **Caps per run.** Images: default 250, ceiling 1,000. Requests: default 500, ceiling 3,000. Attempts per image: default 2, ceiling 3. The API key's monthly spend limit is the last backstop (Q-04).
- **Checks.** A draft is flagged for review when it is too long, reads like an ad, makes claims about standards, echoes instructions, or is decorative or low confidence. Product text goes into the prompt as escaped data, not instructions.
- **Model.** The code defaults to `claude-haiku-5-5` (`DEFAULT_ALT_TEXT_MODEL` in `app/lib/alt-text/config.ts`), and `ALT_TEXT_MODEL` overrides it. D-11 names Haiku 4.5. Q-33 asks the owner to pick.

| | Haiku 5.5 | Haiku 4.5 |
|---|---|---|
| Model ID | `claude-haiku-5-5` | `claude-haiku-4-5` |
| Price per million tokens, input and output | $0.10 and $0.50 | $1 and $5 |
| Batch price (half) | $0.05 and $0.25 | $0.50 and $2.50 |
| Per 1,000 images, at about 1,100 input and 200 output tokens each (Spike C estimate) | about $0.10 | about $1 |
| Retires | not sooner than 2027-10-07 | not sooner than 2026-10-15 |
| API differences the client already handles | `effort: "low"`; no sampling parameters; no prefill; refusals have no server-side fallback | no `effort` parameter |

Prices and retirement dates are from Anthropic's pricing and deprecations pages, read by Spike C on 2026-10-08. The prices are still to be checked against a real invoice. The token counts are a guess; the real run measures them.

- **Plan allowance.** Starter includes alt text for up to 1,000 images a month (D-12). The budget keeps infrastructure plus AI per store under 10% of its plan price: $2.90 on Starter.
- **The fixer interface.** `fixFile` is synchronous and returns `Patch | null` (`app/lib/fixers/types.ts`).

## Decision

### Alt text is the only model call at run time

- It runs on the worker as a background job (ADR 0001). It never runs during a page load, a webhook or a merchant click.
- The worker reads product images through the Admin API and submits a batch. It then checks each draft and stores it in the merchant's review queue. The M4 alt-text lane picks the read scopes and checks them with the Shopify Dev MCP.
- The merchant approves, edits or rejects each draft. Nothing is published without approval. Decorative and low-confidence drafts are always flagged.
- Approved drafts become alt-text changes in a `DeliveryPatch`. Route A writes them with `fileUpdate`, whatever route the store uses for theme fixes (ADR 0002).
- The app shows alt text as pending while a batch runs, since a batch can take up to 24 hours.

### Caps at three levels

1. **Per run.** Spike C's limits on images, requests and attempts, with hard ceilings no flag can raise.
2. **Per store per month.** The plan's image allowance (D-12). The job refuses to submit past it.
3. **Per account.** The API key's monthly spend limit, with alerts (Q-04). Batches can go slightly over it, so it is a backstop, not the cap.

### State moves to Postgres

In M4 the run log moves from files to Postgres and keeps its append-only shape: an intent row before each submit and the batch ID after it. The table is a data model change, so the owner approves it with the M4 contracts.

### The model is configuration

This ADR does not pick the model; Q-33 does. The design is the same for either Haiku. The model ID lives in one constant and one environment variable. A run keeps the model it started with. Every draft already records its model, and drafts will also record a prompt version. The evidence pack and the remediation log show both.

### Keeping option B open

Nothing here builds B. B needs its own owner decision with cost numbers. To keep it a change rather than a rewrite:

- **Async fixers.** The M4 Fixer contract makes `fixFile` return a promise, and the engine awaits each fixer. Rule fixers resolve at once, so a live AI fixer would need no engine change. This is cheap now, with six fixers, and costly once lanes build on the sync shape.
- **Source on every change.** Every patch and every alt-text draft records where it came from: `rule`, with the fixer id and version (ADR 0003), or `model`, with the model ID and prompt version.
- **Same gates.** A model-made patch would pass the same checks as a rule patch: the `before` check, preview, merchant approval, a receipt for revert, and an axe-core rescan. It would always be marked for review.
- **Cached output.** Model output would be cached by theme file hash, fixer, model and prompt version. The same input then gives the same patch, which keeps it idempotent and paid for once.

### Data and claims

- Only public catalogue data reaches Anthropic: image URL, title, product type, existing alt text and locale. No customer data. The privacy policy must say so, and the lawyer review covers it (D-14).
- The prompt forbids claims about accessibility or standards, and the checks flag them (D-06).

## Consequences

- **Cost.** About $0.10 per 1,000 images on Haiku 5.5, or about $1 on Haiku 4.5 (estimates; Spike C's real run measures them). A store that uses its full Starter allowance costs at most about $0.10 or $1 a month, under the $2.90 guardrail either way. Twenty PoC stores at the full allowance cost about $2 or $20 a month. The roadmap's "Claude API for alt text and CI agents" line is $20 to $40 a month in M4 to M6, so on Haiku 4.5, alt text alone could use the low end of that line.
- **Easier.** AI cost grows with images, not page views. The UI never waits on a model. Every draft can be reviewed and traced to a model and prompt version.
- **Harder.** Alt text arrives up to a day after theme fixes. The review queue is extra work for the merchant.
- **Risk: quality is unmeasured.** No real run yet (Q-04), and no owner ratings yet (Q-26). Known failure modes: the wrong variant colour, invented text, decorative images described at length, and uneven quality outside English.
- **Risk: refusals and fetch errors.** Haiku 5.5 refusals have no server-side fallback. The merchant writes those alt texts. If image fetches fail often, switch from URLs to base64.
- **Risk: model retirement.** Haiku 4.5 may retire soon after 2026-10-15. If Q-33 keeps it, plan a move. A move is a config change plus a rating run.
- **Risk: prompt injection.** Merchants control product titles. The defences are the escaped data block, the output checks and merchant approval.
