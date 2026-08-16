---
id: e15
title: UI Designer
status: backlog
---

## Goal

Right now we only can describe the general layout of a UI in text. We have element scoping on the app but that’s not enough.

Id like to have a UI Designer that allows me to block out UI Layouts, and give every block specific instructions.

Blocks can be nested.

Each block has a Name and optional further instructions.

The design is stored in a file in the app code folder

This gos in conjunctions with instructions for the agent on how to understand this UI design. so it is able to follow the layout and the instructions given.

## Definition of done

- A design is stored per app as `design.ui.json` in the app root (next to
  `concept.md`), holding a tree of blocks; each block has `name`, optional
  `instructions`, optional `type`/role hint, `rect{x,y,w,h}`, and `children`.
- An overlay design mode over the running app lets the user draw, move, resize,
  rename, add instructions to, nest, reparent and delete blocks.
- When `design.ui.json` exists, the agent prompt automatically carries a
  `UI-LAYOUT` section describing the block tree; the agent follows it but never
  writes the file (read-only contract).
- Out of scope: agent-authored designs, responsive/breakpoints,
  snap-to-grid and template/component libraries (possible follow-ups).

## Plan (steps + dependencies)

1. Design model + persistence — `core/design.ts`: block/tree types, the
   `design.ui.json` app-root filename, load/save via the app fs, validate +
   normalize, and tree helpers (add / remove / move / reparent / walk), with
   unit tests. The foundation everything else builds on.
2. Overlay design mode — toggle + read-only render — a translucent design
   layer drawn over the active app window, toggled from the titlebar (and a
   shortcut), that reads the design and renders existing blocks as labelled
   boxes. Open/close and render only. (← step 1)
3. Prompt injection — extend `buildPrompt` / the system prompt and
   `generate.ts` to read `design.ui.json` and emit a `UI-LAYOUT` section
   describing the block tree when the file exists, stating the read-only
   contract. Independent of the editor. (← step 1)
4. Thin end-to-end slice — drag on the overlay to draw one flat block,
   inline-edit its name, and persist it through `core/design`. First writable
   slice; closes the loop draw → save → agent follows. (← step 2, step 3)
5. Block instructions + type/role editing — edit a selected block's optional
   instructions text and role hint (inline or popover); reflect both in the
   JSON and the prompt section. (← step 4)
6. Move + resize blocks — select a block, drag to move it, drag handles to
   resize it, and persist the geometry. (← step 4)
7. Nesting + reparent + delete — drag a block into another to nest, drag it
   out to reparent, delete blocks; keep child geometry sane and reflect the
   nesting in the JSON tree and the prompt section's indentation. (← step 5,
   step 6)
