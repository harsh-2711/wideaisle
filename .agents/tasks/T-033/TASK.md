# T-033: Spike D: scan benchmark

| Field | Value |
|---|---|
| Milestone | M3 |
| Lane | scanner |
| Branch | claude/feat-scan-benchmark |
| Issue | harsh-2711/wideaisle#29 |
| Decisions used | D-10 |
| Needs | none |
| Created | 2026-10-08 |

## Goal

Time and cost 1,000 page scans on a small server versus Cloudflare Browser Run.

## Exit criteria

Each one is a test or a check someone can run.

- [x] Local benchmark with measured pages per hour (`npm run bench:scan`; results in `docs/spikes/spike-d-scan-benchmark.md`)
- [ ] Browser Run comparison (needs Q-05)

## Out of scope

- A Cloudflare client or any Browser Run sign-up (D-04, Q-05).
- Scans of live stores (Q-01).
- Editing `docs/adr/0005-poc-hosting.md`; T-034 does that after this merges.
