---
id: c0106
title: "Prompt injection — UI-LAYOUT section when design exists"
status: ready
epic: e15
depends: [c0104]
created: 2026-08-16
updated: 2026-08-16
status-changed: 2026-08-16T23:09:41
order: 30
---

# Prompt injection — UI-LAYOUT section when design exists

## What

Teach the agent to follow the design. Extend `buildPrompt` (and the
`SYSTEM_PROMPT` in `core/prompt.ts`) plus the generation path (`core/generate`)
so that when `design.ui.json` exists, the prompt automatically carries a
`UI-LAYOUT` section describing the block tree — each block's name, role/type,
geometry, instructions, and nesting — with a clear statement that the design is
authoritative and read-only (the agent follows it but never writes the file).

## Acceptance criteria

- [ ] `buildPrompt` emits a `UI-LAYOUT` section (like the marked-elements
      section) only when a design is present and non-empty.
- [ ] The block tree is rendered as readable, indented text (name, type,
      rect, instructions, children).
- [ ] The system prompt explains the design file's meaning and the read-only
      contract (agent must not edit `design.ui.json`).
- [ ] `core/generate` reads the design and passes it into `buildPrompt`.
- [ ] `prompt.spec.ts` covers presence, absence, and nesting rendering.

## Notes

Independent of the editor — depends only on the c0104 model. Follow the
existing `formatElementRefs`/attachments section style in `core/prompt.ts`.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
