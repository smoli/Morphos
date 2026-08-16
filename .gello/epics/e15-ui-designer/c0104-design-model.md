---
id: c0104
title: "Design model + persistence (core/design.ts)"
status: review
epic: e15
depends: []
created: 2026-08-16
updated: 2026-08-16
status-changed: 2026-08-16T23:15:23
---

# Design model + persistence (core/design.ts)

## What

The foundation for the UI Designer: a `core/design.ts` module that defines the
block/design data model and reads/writes it as `design.ui.json` in the app
root (next to `concept.md`, NOT under `src/`). A block is
`{ id, name, instructions?, type?, rect: {x,y,w,h}, children: Block[] }`; a
design is the root block tree plus a schema `version`. Load/save go through the
app filesystem (`core/appfs`/`core/files`). Provide validation/normalization
(coerce malformed input to a safe tree, clamp geometry) and pure tree helpers:
add, remove, move, reparent, and a walk/find-by-id.

## Acceptance criteria

- [x] Types for `Block` and `Design` exist (in `src/types` or exported from
      `core/design`), with `rect{x,y,w,h}`, optional `instructions` and `type`,
      and `children`.
- [x] `design.ui.json` filename/constant lives at the app root; load returns an
      empty/normalized design when the file is absent.
- [x] `load`/`save` round-trip a design through the app fs without loss.
- [x] Validation rejects/normalizes malformed JSON (missing fields, bad
      geometry, cyclic ids) into a safe tree.
- [x] Tree helpers (add/remove/move/reparent/walk/find) are pure and covered by
      unit tests.
- [x] `core/design.spec.ts` covers the model, persistence, normalization, and
      helpers.

## Notes

Read-only for the agent — only the shell writes this file, so it is fine that it
lives at the app root outside the agent's writable `src/` scope. Bundling only
touches `src/`, so `design.ui.json` won't be embedded in the app. A test in
`design.spec.ts` pins that contract: `isValidOutputPath('design.ui.json')` is
false.

**Geometry is fractions, not pixels** (decided here, affects c0107/c0109/c0110):
`rect` holds shares of the *app window*, `0…1` in both directions, so a design
survives a window resize and means the same in every tile. The shares are
absolute — a child's rect refers to the window too, not to its parent. Nesting
is therefore a pure statement about structure, and reparenting moves nothing.
Values are rounded to four decimals so the file stays diff-stable.

**API** (`src/core/design.ts`): `DESIGN_FILE`, `DESIGN_VERSION`,
`MAX_DESIGN_DEPTH`, `MIN_BLOCK_SIZE`, `designPath`, `emptyDesign`,
`makeBlockId`, `clampRect`, `normalizeDesign`, `readDesign`, `writeDesign`,
`walkBlocks`, `listBlocks`, `findBlock`, `addBlock`, `removeBlock`, `moveBlock`,
`updateBlock`, `reparentBlock`. Persistence uses `node:fs` like `core/appstore`
(main process); the renderer will reach it through an IPC method added in c0105.
Every tree helper returns a new design and leaves the given one untouched; an
unknown id, a taken id or a cycle leaves the design unchanged instead of
throwing — a stray drag can't destroy a design. Normalization re-ids duplicates
(so `findBlock` can't hit the wrong block), drops non-blocks, caps depth at 16
and caps name/type/instructions lengths (they go into every prompt).

`updateBlock` is not in the acceptance list but is one helper of the same family
and is what c0108 needs; it is covered by tests.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-16 `core/design.ts` + `core/design.spec.ts` (49 tests); full suite
  1781 tests green, `vue-tsc` clean.
- 2026-08-16 status → in-progress (agent)
- 2026-08-16 status → review (agent)
