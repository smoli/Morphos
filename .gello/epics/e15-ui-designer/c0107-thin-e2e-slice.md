---
id: c0107
title: "Thin end-to-end slice — draw + name + persist one block"
status: backlog
epic: e15
depends: [c0105, c0106]
created: 2026-08-16
updated: 2026-08-16
---

# Thin end-to-end slice — draw + name + persist one block

## What

The first writable slice that closes the whole loop. On the design overlay, the
user drags to draw one flat block, edits its name inline, and the block is
persisted to `design.ui.json` through `core/design`. Because the file now
exists, the next agent run automatically receives the `UI-LAYOUT` section
(c0106) and can follow it: draw → save → agent follows.

## Acceptance criteria

- [ ] Dragging on the overlay draws a new block at the dragged `rect`.
- [ ] The new block's name is editable inline and defaults to a placeholder.
- [ ] Drawing/naming persists the design to `design.ui.json` via `core/design`.
- [ ] Reopening design mode shows the persisted block.
- [ ] A subsequent generation includes the block in the `UI-LAYOUT` section
      (verified against c0106).
- [ ] A `.spec.ts` covers draw → name → persist.

## Notes

Flat/single block only — nesting, resize/move, instructions and roles are the
follow-on cards (c0108–c0110). Keep this deliberately minimal to prove the loop.

## Log

- 2026-08-16 created from the e15 epic breakdown.
