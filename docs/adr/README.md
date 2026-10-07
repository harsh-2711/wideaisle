# Architecture decision records

One file per architecture decision, named `NNNN-short-title.md` (for example `0001-theme-fix-library-layout.md`). The architect writes them; the owner approves the ones that are one-way doors.

Use this shape:

```markdown
# NNNN. Title

Status: Proposed | Accepted | Superseded by NNNN
Date: YYYY-MM-DD
Decisions used: D-xx

## Context
What forces the choice. Facts and numbers.

## Decision
What we do.

## Consequences
What gets easier, what gets harder, what it costs per month.
```

Owner decisions (cost, scope, policy) go in `decisions/`, not here.
