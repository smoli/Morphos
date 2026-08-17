---
id: c0109
title: "Move + resize blocks"
status: in-progress
epic: e15
depends: [c0107]
created: 2026-08-16
updated: 2026-08-17
status-changed: 2026-08-17T18:58:23
---

# Move + resize blocks

## What

Make placed blocks adjustable: select a block, drag its body to move it, and
drag edge/corner handles to resize it. Geometry updates persist to
`design.ui.json` through `core/design`.

## Acceptance criteria

- [ ] A selected block can be dragged to a new position; `rect.x/y` update.
- [ ] Resize handles change `rect.w/h`, with a sensible minimum size.
- [ ] Geometry changes persist and survive reopening design mode.
- [ ] Geometry stays within the overlay/app bounds (clamped, no negatives).
- [ ] A `.spec.ts` covers move and resize updating and persisting geometry.

## Notes

Parallel to c0108 — both build on the c0107 slice. Snap-to-grid is explicitly a
later follow-up, not part of this card.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 status → in-progress (agent)
