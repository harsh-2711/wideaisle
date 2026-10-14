# T-029: Census page decoder: several content-encodings

| Field | Value |
|---|---|
| Milestone | M2 |
| Lane | data |
| Branch | claude/fix-census-multi-encoding |
| Issue | (link once created) |
| Decisions used | none |
| Needs | none |
| Created | 2026-10-14 |

## Goal

Decode page bodies with stacked or raw content-encodings the way Chromium does, still under MAX_PAGE_BYTES, or skip them with a clear reason

## Exit criteria

Each one is a test or a check someone can run.

- [ ] A 'gzip, gzip' page and a raw-deflate page each render or are skipped with a reason; neither breaks the store's next page
- [ ] Both caps still hold for every encoding

## Out of scope

- Other census changes. Encodings other than gzip, deflate and br.
