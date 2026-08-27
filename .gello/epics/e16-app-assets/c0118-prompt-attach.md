---
id: c0118
title: "Per-wish asset attach — stored assets into the prompt"
status: ready
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:29:05
order: 30
---

# Per-wish asset attach — stored assets into the prompt

## What

Let the user point the agent at a stored asset for a specific wish. The user can
attach one or more assets that already live in `assets/` to a wish; `buildPrompt`
then names each attached asset by its **in-app path** `assets/<name>` so the
agent can wire it into the code. This is distinct from today's transient
`Attachment` (an absolute path from the native dialog, not stored in the app).

**Simpler than transient attachments (decided):** the agent's working directory
IS the app folder, so an attached image asset is `Read`-able at its plain
relative path (`assets/logo.png`) — no absolute-path plumbing like
`main.ts` does for dialog-chosen images. The prompt just says "here is
`assets/<name>`; `Read` it if you need to see it."

## Acceptance criteria

- [ ] A wish can attach one or more STORED assets (chosen from the app's
      `assets/`).
- [ ] The prompt lists each attached asset with its in-app path `assets/<name>`.
- [ ] Image assets are `Read`-able via that same relative path (no absolute path
      passed) — the working dir is the app folder.
- [ ] Stored-asset attachments are visually distinct from and coexist with the
      existing transient `Attachment` flow.
- [ ] The attachment is recorded on the chat message for display (like today's
      attachment names).
- [ ] Specs cover the prompt formatting for a stored-asset attach (path listed;
      image Read-able) alongside existing attachment behaviour.

## Notes

Depends on the c0116 storage model (needs the list of stored assets and their
paths). Extends `core/prompt` (`buildPrompt`) and the composer's attach flow.
Read-only for the agent — it references the asset, never writes it.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
