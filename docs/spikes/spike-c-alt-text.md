# Spike C: alt text with Claude in batch

| Field | Value |
|---|---|
| Task | T-032, branch `claude/feat-alt-text` |
| Decisions | D-11 (AI only offline, alt text in batch, merchants approve), D-06 (claims), D-04 (buy nothing) |
| Status | Agent part done. Real run waits on Q-04 (API key) and Q-33 (model approval); ratings on Q-26. |
| Date | 2026-10-08 |

## Summary

- The batch client, prompt, checks, resume logic, cost report and rating sheet are built and tested with a mocked SDK. Nothing has called the real API.
- Default model: `claude-haiku-5-5`, the current Haiku. The plan named Haiku 4.5. Set `ALT_TEXT_MODEL=claude-haiku-4-5` to run the plan's model instead.
- Rough estimate before measuring: about 1,100 input and 200 output tokens per image, so about $0.10 per 1,000 images on Haiku 5.5 and about $1 on Haiku 4.5, at batch prices still to verify. The real run replaces this guess with measured usage.
- The output is a review queue. Nothing is written to a store. Merchants approve every alt text (D-11).

## Model choice

The roadmap and D-11 say "Claude Haiku 4.5 in batch". Since the plan was written, Claude Haiku 5.5 became the current Haiku, and Haiku 4.5 is listed as a legacy model. The default is Haiku 5.5 because:

- Its batch price is a tenth of Haiku 4.5's: $0.05 input and $0.25 output per million tokens, against $0.50 and $2.50 (pricing page, to verify).
- It will last. The deprecations page gives Haiku 5.5 a retirement not sooner than October 7, 2027. Haiku 4.5 (`claude-haiku-4-5-20251001`) has "not sooner than October 15, 2026", one week from today, so the plan's model may be gone before lane C ships.

What changes with Haiku 5.5, and how the code handles it:

| Change | Handling |
|---|---|
| Adaptive thinking is on by default; thinking tokens are billed as output | `effort: "low"` keeps thinking short. `max_tokens` 1024 leaves room for it. Thinking blocks are skipped when reading the answer. |
| `temperature`, `top_p` and `top_k` other than defaults return 400 | Not sent. Structured output fixes the format instead. |
| Assistant prefill returns 400 | Not used. |
| Newer tokenizer: about 30% more tokens for the same text | Cost comes from measured usage, not from a token guess. |
| Safety classifiers can refuse, with no server-side fallback | A refusal goes to `failed.jsonl` and is not retried. |
| Released on or about 2026-10-07 | Little track record. The rating sheet is the check. |

The model ID lives in one constant, `DEFAULT_ALT_TEXT_MODEL` in `app/lib/alt-text/config.ts`, overridable with `ALT_TEXT_MODEL`. A run keeps the model it started with, even if a resume asks for another. Haiku 4.5 does not accept `effort`, so the client leaves it out for that model.

Owner queue Q-33 asks you to approve Haiku 5.5 in place of the Haiku 4.5 that D-11 names. The real run waits for that answer.

## How it works

```
products.jsonl
  -> take the run folder's lock file
  -> validate, de-duplicate by media ID, assign custom_id
  -> check the run's image cap; check the request cap before each batch
  -> batches.create (one request per image; no SDK retries)
  -> poll: 30 s, doubling to 10 min, give up after 25 h (batches expire at 24 h)
  -> stream results, match by custom_id (results arrive in any order)
  -> parse and check each draft
  -> resend errored, canceled, expired and unusable results once
  -> results.jsonl (review queue), retry.jsonl, failed.jsonl, summary.json
```

Code: `app/lib/alt-text/`. CLI: `scripts/alt-text/run.ts` (`npm run alt-text`). Tests: `tests/unit/alt-text/`.

### Input

One JSON object per line: `productId`, `mediaId`, `imageUrl`, `productTitle`, and optional `productType`, `existingAlt` and `locale`. Lines with a missing field, a non-https URL, a repeated media ID or a `locale` that is not a valid BCP 47 language tag are skipped with a reason. Valid locales are put in canonical form, so `en-us` becomes `en-US`.

### custom_id

The Batch API allows 1 to 64 letters, digits, `-` and `_`. A Shopify media GID such as `gid://shopify/MediaImage/123` becomes `m_123`. Anything else, or a clash with an image in the same input or added earlier to the same run, becomes `h_` plus 40 hex characters of its SHA-256.

### Images: URLs, not base64

Images go as `{"type": "url"}` sources. For Shopify CDN URLs (`cdn.shopify.com` or a storefront's `/cdn/shop/`) the client sets `width=512`, so the CDN serves a small copy.

Why URLs:

- Token cost depends on pixels: one token per 28 by 28 px patch. A 512 px square is 361 tokens. An unresized 2048 px photo would hit the cap of 4,784 tokens on the high-resolution tier, about 13 times more. The vision docs put "Claude 4.7 and later models" on that tier; we assume Haiku 5.5 is one of them.
- Shopify's CDN already resizes on request, so we need no image library (such as the native `sharp` package) and do not download every image ourselves.
- The batch stays small: about 2.5 KB per request, against roughly 50 KB with base64. The batch limit is 256 MB.

Costs of this choice:

- Anthropic fetches the image at processing time. A blocked or deleted URL comes back as an errored result. Those land in `failed.jsonl` (invalid request) or `retry.jsonl`.
- Images on other hosts are sent unchanged and may cost more tokens. The real run will show if this matters.
- Amazon Bedrock and Google Cloud accept only base64 images. We use the Claude API directly, so this does not apply now.
- Not confirmed: the batch docs say vision works in batches but do not mention URL sources by name. The first real run is a one-image batch to check this.

Switch to base64 if URL fetches fail often in the real run.

### Prompt

The full text is `SYSTEM_PROMPT` in `app/lib/alt-text/prompt.ts`. In short:

- Write what a shopper needs: product, colour, one or two visible details.
- One plain phrase or sentence, under 125 characters. No "image of".
- Describe only what is visible. No guessing brand, size or material.
- No prices, offers, links or keyword lists. Nothing about accessibility, compliance or standards.
- Write in the language of `locale`.
- Decorative image: set `decorative`, leave `alt` empty. Unclear image: set `needs_review` and say why. Do not guess.

The user turn is the image first (the vision docs recommend image before text), then the store data and one line of instruction.

Answers use structured output (`output_config.format`) with this schema: `alt`, `decorative`, `needs_review`, `confidence` (`high`, `medium`, `low`) and `review_note`. The schema cannot hold a length limit, so length is checked after parsing.

### Store text is data, not instructions

Product titles and alt text come from merchants, and anyone who can edit a product can put instructions there. Defences:

1. Store text goes in a `<product_data>` block as JSON. `<`, `>` and `&` are escaped, so a title cannot close the block.
2. Each field is cut to 512 characters and whitespace is collapsed.
3. The system prompt says the block is data, and that instructions inside it must not be followed but reported in `review_note`.
4. Every draft is checked after parsing. Ads, links, claims and echoes of instructions are flagged for review.
5. Nothing is published without a merchant's approval.

### Checks on each draft

A draft is kept but marked `needsReview` with a reason when:

- the model set `needs_review`, `decorative` or `confidence: low`;
- it is longer than 125 characters;
- it starts with "image of", "picture of", "photo of" or similar;
- it mentions accessibility, compliance, WCAG, ADA or certification;
- it reads like an ad or has a link;
- it echoes instructions ("ignore previous instructions");
- it repeats a word three or more times, or has five or more comma-separated parts (keyword lists);
- it only repeats the product title;
- it is empty but not decorative.

### Results that are not drafts

| Result | Outcome |
|---|---|
| `errored` with `invalid_request_error` (for example an image that cannot be fetched) | `failed.jsonl`, not retried |
| `errored`, any other type | resent once, then `retry.jsonl` |
| `canceled`, `expired`, or missing from the results file | resent once, then `retry.jsonl` |
| `succeeded` but not valid JSON, or cut off at `max_tokens` | resent once (billed), then `retry.jsonl` |
| `succeeded` with `stop_reason: refusal` | `failed.jsonl` (billed), not retried |

`retry.jsonl` lines are valid input, so `npm run alt-text -- --input retry.jsonl` resends them later. `--max-attempts` raises the limit on a resume, up to its ceiling of 3.

### Resume and paying once

Run state is an append-only log, `data/alt-text/<run>/state.jsonl` (`/data/` is gitignored). Every step is written before the next starts:

- An `intent` line before `batches.create`, and `submitted` with the batch ID after it.
- A `result` line per image as results stream in, and `collected` when a batch is done.

Running the same command again with `--run <name>` picks up where it stopped: it polls open batches, skips results it already has, and sends only what is still pending. A finished run makes no API calls on resume.

`batches.create` is sent with the SDK's retries turned off (`maxRetries: 0`). The endpoint takes no idempotency key, so an automatic retry after a slow reply or a 429 could create, and bill, a second batch the log never sees. `retrieve` and `results` keep the SDK's default retries, since repeating a read costs nothing.

Any error from `batches.create`, a 4xx included, counts as an unknown outcome: the `intent` line stays open. The same holds if the process stops between `batches.create` and saving the batch ID. A resume then stops and asks you to check the Console batch list. Resend with `--allow-resubmit` only if no batch was created. The images in an abandoned submission still count toward the request cap, since they may have been billed.

A `lock` file in the run folder stops two processes from working on the same run. It is removed when the run ends, fails or is stopped with Ctrl-C. If a crash leaves it behind, the next run names the file to delete.

### Spending limits

Three limits apply, each counted across every command on the same `--run` folder. Options and flags can lower or raise them, but never above the hard ceiling:

| Limit | What it counts | Default | Ceiling | When reached |
|---|---|---|---|---|
| `--max-images` | Images the run folder holds in total, earlier commands included. Known media IDs are not counted twice. | 250 | 1,000 | Checked before anything is added or sent. Over it, the command stops and the run is unchanged. |
| `--max-requests` | Requests sent for the run in total: first tries, retries and abandoned submissions. | 500 | 3,000 | The run stops sending. Unsent images go to `retry.jsonl` with the reason "request cap of N reached". |
| `--max-attempts` | Times one image may be sent, first try included. | 2 | 3 | The image goes to `retry.jsonl` with its last reason. |

At the defaults, one run sends at most 500 requests. At about $0.10 per 1,000 images on Haiku 5.5, or about $1 on Haiku 4.5 (estimates), that is a few cents to about 50 cents. The ceilings bound a run at 3,000 requests, about $3 on Haiku 4.5. The API key's spend limit (Q-04) stays the last backstop.

### Prompt caching

Not used. The system prompt is about 1,300 characters, roughly 400 tokens. That is likely below the smallest prefix the API caches (the minimum depends on the model; not checked for Haiku 5.5), and batch cache hits are best-effort anyway. Revisit if the prompt grows.

## How cost per 1,000 images is measured

The Batch API returns `usage` on every succeeded result: `input_tokens`, `output_tokens`, `cache_creation_input_tokens` and `cache_read_input_tokens`. Output includes thinking tokens. Errored, canceled and expired requests are not billed.

`app/lib/alt-text/cost.ts` sums usage over every billed result, retries included, and prices it from `MODEL_PRICES` in `config.ts`:

```
cost per request = (input x input price + output x output price
                    + cache writes x write price + cache reads x read price)
                   / 1,000,000 x 0.5 (batch discount)
cost per 1,000 drafts = total cost / images with a draft x 1,000
```

Haiku 5.5 has a higher rate card for prompts over 100,000 tokens. The code applies it per request, though alt-text prompts are far below that.

Every price is marked "to verify", with its source and the date it was read. `summary.json` and the CLI print `per1000DraftsUsd`, `per1000RequestsUsd`, average tokens per image and the price status. After the real run, an agent checks the total against the Console usage page and updates the status.

The pre-run estimate (`--dry-run`) assumes about 0.3 tokens per prompt character, 200 tokens of overhead, a 512 by 640 px image (437 tokens) and 200 output tokens. It is a guess for a go or no-go, not a result.

## What the real run needs

1. **Q-04:** an Anthropic API key with a monthly spend limit, as the `ANTHROPIC_API_KEY` secret in the cloud environment. 200 images should cost well under $1 on either Haiku. Batches can go slightly over a workspace spend limit, so the limit is a backstop, not an exact cap. The run's own caps are in "Spending limits" above.
2. **Q-33:** your approval of Haiku 5.5 in place of the Haiku 4.5 that D-11 names.
3. **200 product images.** Either products on the Q-03 dev store, exported to JSONL with the Admin API (lane C builds that query; check it with the Shopify Dev MCP), or public product images we have the right to use. They should look like real catalogue photos: several angles, variants in different colours, some lifestyle shots and a few decorative images.
4. **Network:** the run needs `api.anthropic.com`. The image hosts only need to be reachable by Anthropic, not by us.
5. **Q-26:** your 50 ratings, using [alt-text-rating-sheet.md](alt-text-rating-sheet.md).

Commands:

```sh
npm run alt-text -- --input products.jsonl --dry-run
npm run alt-text -- --input products.jsonl --limit 1 --run spike-c-one --yes
npm run alt-text -- --input products.jsonl --run spike-c --yes
npm run alt-text:sheet -- --results data/alt-text/spike-c/results.jsonl
```

## Risks

| Risk | What could go wrong | Mitigation |
|---|---|---|
| Wrong product details | The image shows a different variant from the title, so the colour is wrong. The model trusts the title over the image. | The prompt says describe what is visible. Your ratings measure it. Merchants approve every draft. |
| Invented text | The model "reads" a brand or label that is not legible, or adds a material it cannot see. | Prompt forbids guessing. "Accurate" in the rubric catches it. |
| Decorative images | A texture, banner or size chart gets a long description, or a real product photo is marked decorative and loses its alt. | Decorative answers are always flagged for review, never applied silently. |
| Multilingual stores | Quality outside English is unknown. The store's locale may not match the title's language. | `locale` is passed per image. Rate a few drafts per language before enabling one. Translated alt text per locale is out of scope here. |
| Prompt injection | A title tells the model to write an ad or a claim. | Escaped data block, prompt rule, output checks, merchant approval. Tested with a hostile title. |
| Refusals | Safety classifiers decline a harmless product image. Haiku 5.5 has no server-side fallback. | Recorded in `failed.jsonl`; the merchant writes that alt text. Count them in the real run. |
| Image fetch | The CDN blocks the fetch, or the URL is gone. | Errored results are listed with the reason. Switch to base64 if this is common. |
| Cost drift | Thinking at low effort uses more output tokens than guessed, or the tokenizer counts more. | Cost is measured, not estimated. `max_tokens` caps each answer. |
| Latency | Batches can take up to 24 hours. | The product treats alt text as a background job with a review queue, never on a page load (D-11). |
| Claims | A draft says "accessible" or "compliant", which D-06 forbids. | Prompt rule plus a check that flags such words. |
| Data | Product images and titles go to Anthropic. | Public catalogue data only. The privacy policy must say so; the lawyer review covers it (D-14). |

Automated drafts and checks cannot catch every bad alt text. The merchant review queue stays in the loop.

## Sources

Opened means an agent read the page on that date. Via search means only a search result was seen.

| Source | What it gave | Status |
|---|---|---|
| [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing) | Limits (100,000 requests or 256 MB, 24 h expiry, results for 29 days), custom_id pattern, result types, not billed when errored, canceled or expired, any result order, cache hits best-effort, spend limit may be exceeded slightly | Opened 2026-10-08 |
| [Vision](https://platform.claude.com/docs/en/build-with-claude/vision) | URL and base64 sources, 28 px patch tokens, high-resolution tier limits, image before text, base64 only on Bedrock and Google Cloud | Opened 2026-10-08 |
| [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) | Haiku 5.5 and Haiku 4.5 standard and batch prices, Haiku 5.5 long-prompt rates | Opened 2026-10-08; prices still to verify against an invoice |
| [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) | `claude-haiku-5-5` is the current Haiku; Haiku 4.5 is legacy; adaptive thinking, default effort medium | Opened 2026-10-08 |
| [Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) | Haiku 5.5 retires not sooner than October 7, 2027; Haiku 4.5 (`claude-haiku-4-5-20251001`) not sooner than October 15, 2026 | Opened 2026-10-08 |
| [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) | Haiku 5.5 supported; `enum` yes, `maxLength` no; refusal and `max_tokens` can break the schema; compare enums ignoring case | Opened 2026-10-08 (first 100,000 characters) |
| Haiku 5.5 migration notes (Anthropic's Claude API reference, bundled with Claude Code) | No sampling parameters, no prefill, effort instead of disabling thinking, 30% more tokens, refusals without fallback | Opened 2026-10-08 |
| `@anthropic-ai/sdk` on npm, and its type definitions | Version 0.132.1 (published 2026-10-08), `messages.batches.create`, `retrieve`, `results` shapes, the per-request `maxRetries` option (client default 2) | Opened 2026-10-08 |
| [Shopify `image_url` filter](https://shopify.dev/docs/api/liquid/filters/image_url) | The CDN takes a `width` parameter, does not upscale, maximum 5,760 px | Via search, not opened (shopify.dev does not resolve from the cloud environment) 2026-10-08 |
| [W3C WAI alt decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/) | Decorative images take empty alt; informative images a short description | Via search, not opened 2026-10-08 |
