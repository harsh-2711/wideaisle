# Recorded GitHub REST responses

Hand-written, not captured. Shapes follow GitHub's REST description as
published in `@octokit/openapi-types@29.0.1` (read 2026-10-08): `git-ref`,
`git-commit`, `git-tree`, `short-blob` and `pull-request`. Pull request
bodies keep the fields the adapter reads plus the common ones; the real
object has more. Error bodies (rate limits, 422) follow GitHub's usual
`message` and `documentation_url` shape from memory; docs.github.com was
not reachable from here.

Blob SHAs are the real git object IDs of the strings in
`tests/unit/delivery/theme-data.ts` (checked against `git hash-object`).
Commit and tree SHAs are placeholders.

Repository `acme-agency/acme-dawn-theme`, branch `main` connected to the
live theme.

| File | Request | What it shows |
|---|---|---|
| get-ref.json, get-commit.json, get-tree.json | GET ref, commit, tree | The branch as the scan saw it |
| get-tree-merchant-edited.json | GET tree | The header changed after the scan |
| create-blob-*.json | POST git/blobs | One blob per changed file |
| create-tree.json, create-commit.json, create-ref.json | POST | The patch commit on `wide-aisle/p-001` |
| create-pull.json | POST pulls, GET pulls/42 | Pull request #42, open |
| update-pull-closed.json | PATCH pulls/42 | Closed without merging |
| get-pull-merged.json | GET pulls/42 | Merged |
| get-ref-merged.json, get-commit-merged.json, get-tree-merged.json | GET | The branch after the merge |
| create-tree-revert.json, create-commit-revert.json, create-ref-revert.json, create-pull-revert.json | POST | Revert pull request #43 |
| rate-limited.json | any | Primary rate limit (403, x-ratelimit-remaining 0) |
| secondary-rate-limit.json | any | Secondary rate limit (403 with retry-after) |
| ref-exists.json | POST git/refs | 422: the branch already exists |
| pull-exists.json | POST pulls | 422: a pull request already exists |
