---
id: c0104
title: "Design model + persistence (core/design.ts)"
status: in-progress
epic: e15
depends: []
created: 2026-08-16
updated: 2026-08-16
status-changed: 2026-08-16T23:09:56
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

- [ ] Types for `Block` and `Design` exist (in `src/types` or exported from
      `core/design`), with `rect{x,y,w,h}`, optional `instructions` and `type`,
      and `children`.
- [ ] `design.ui.json` filename/constant lives at the app root; load returns an
      empty/normalized design when the file is absent.
- [ ] `load`/`save` round-trip a design through the app fs without loss.
- [ ] Validation rejects/normalizes malformed JSON (missing fields, bad
      geometry, cyclic ids) into a safe tree.
- [ ] Tree helpers (add/remove/move/reparent/walk/find) are pure and covered by
      unit tests.
- [ ] `core/design.spec.ts` covers the model, persistence, normalization, and
      helpers.

## Notes

Read-only for the agent — only the shell writes this file, so it is fine that it
lives at the app root outside the agent's writable `src/` scope. Bundling only
touches `src/`, so `design.ui.json` won't be embedded in the app.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-16 status → in-progress (agent)
