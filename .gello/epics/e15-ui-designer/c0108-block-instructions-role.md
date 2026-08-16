---
id: c0108
title: "Block instructions + type/role editing"
status: backlog
epic: e15
depends: [c0107]
created: 2026-08-16
updated: 2026-08-16
---

# Block instructions + type/role editing

## What

Let the user give a selected block its optional free-text `instructions` and a
`type`/role hint (e.g. header, sidebar, list, button), edited inline or in a
small popover. Both are persisted into `design.ui.json` and flow into the
`UI-LAYOUT` prompt section so the agent sees per-block guidance.

## Acceptance criteria

- [ ] Selecting a block reveals editors for its `instructions` and `type`/role.
- [ ] Edits persist to `design.ui.json` via `core/design`.
- [ ] `instructions` and `type` appear in the `UI-LAYOUT` prompt section for
      that block.
- [ ] Empty instructions/role are omitted cleanly (no empty noise in JSON or
      prompt).
- [ ] A `.spec.ts` covers editing and persistence of both fields.

## Notes

Role hint can be a free-text field or a small preset list — the epic only
requires it be optional and steer the agent. Builds directly on the c0107 slice.

## Log

- 2026-08-16 created from the e15 epic breakdown.
