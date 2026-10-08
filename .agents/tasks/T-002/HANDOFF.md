# Handoff: T-002 CI, templates and CODEOWNERS

Update after every step, before compaction, before stopping and before handing over. A fresh agent must be able to continue from this file, TASK.md, the last events and the branch's git log alone.

## Goal and exit criteria

See TASK.md. CI for types, lint, tests, an accessibility check on fixtures, and the repo rule checks.

## Status

Done. Merged to main in harsh-2711/wideaisle#8 (merge commit 2fb0abf).

## Done so far

| Step | Commit |
|---|---|
| CI workflow, rule checks, templates | 3bd52f7 |
| Integration job fails when the database is missing | e118ed0 |
| Review fixes: env-passed refs, scoped rule checks, CODEOWNERS | 357f9dd |
| Merged | 2fb0abf |

## Current step

None. The task is done.

## Next three steps

1. Nothing left on this task.
2. Branch protection that requires these checks is T-003 (owner, Q-08).
3. Add new rule checks to scripts/ci/checks.mjs with a test in checks.test.mjs.

## Blockers and open questions

- None yet.

## Decisions used

D-06

## Files touched

- .github/workflows/ci.yml, .github/CODEOWNERS, .github/pull_request_template.md, .github/ISSUE_TEMPLATE/
- scripts/ci/checks.mjs, scripts/ci/checks.test.mjs

## How to verify

- CI on harsh-2711/wideaisle#8 is green: `gh pr checks 8`.
- `node --test scripts/ci/checks.test.mjs` passes. It shows the Pending-decision and HANDOFF checks fail when they should.

## Lessons and gotchas

- The handoff, claims and writing checks compare against a base branch. Run them locally with `--base origin/main`, as CI does with the pull request's base.
- These two sections were dropped in 090077a and restored by T-008.
