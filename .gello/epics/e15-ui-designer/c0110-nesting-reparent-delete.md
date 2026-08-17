---
id: c0110
title: "Nesting + reparent + delete"
status: in-progress
epic: e15
depends: [c0108, c0109]
created: 2026-08-16
updated: 2026-08-17
status-changed: 2026-08-17T19:14:38
---

# Nesting + reparent + delete

## What

Complete the block manipulation. Dragging a block into another nests it as a
child; dragging it out reparents it (up to the root); deleting a block removes
it (and offers a sensible rule for its children). The block tree in
`design.ui.json` reflects the nesting, and the `UI-LAYOUT` prompt section
renders the hierarchy with indentation.

## Acceptance criteria

- [ ] Dropping a block inside another makes it a child (using `core/design`
      reparent helpers); child geometry stays sane relative to the parent.
- [ ] Dragging a block out reparents it toward the root.
- [ ] Deleting a block removes it; its children are either removed or promoted
      by a defined, tested rule.
- [ ] The JSON tree and the `UI-LAYOUT` prompt section show the resulting
      nesting/indentation.
- [ ] No cycles are ever created (a block cannot become its own descendant).
- [ ] A `.spec.ts` covers nest, reparent, delete, and the no-cycle guard.

## Notes

Final card of the epic; depends on both editing cards (c0108, c0109). Reuses the
tree helpers from c0104.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 status → in-progress (agent)
