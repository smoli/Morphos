---
id: c0035
title: Protocol concept and docs
status: in-progress
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T17:08:02
epic: e08
---

## What

Give each app two shell-maintained markdown documents that evolve with it:

- **concept.md** — a living spec of the app's intent and design. It is fed back
  into **every prompt as context** so the agent stays consistent, and is rewritten
  to reflect new intent on each change. The app's persistent memory beyond the
  chat/diff.
- **userdocumentation.md** — end-user how-to, updated on each change.

Both are produced in the **same generation** as the app change (via the file
protocol), stored **git-tracked** in the app folder, and openable as a
**read-only markdown viewer** from the app's window.

## Acceptance criteria

- [x] Each app has a root `concept.md` and `userdocumentation.md` in the app
      folder, **git-tracked** (they version with the app; a revert restores that
      version's docs) and **not** bundled into `index.html`.
- [x] Every generation that changes the app updates **both docs in the same LLM
      call**, emitted via the existing FILE-block protocol.
- [x] The file protocol accepts **exactly** `concept.md` and
      `userdocumentation.md` at the root and still **rejects any other**
      non-`src/` path (no arbitrary root writes / traversal).
- [x] `concept.md` is included as **context in every prompt**; `SYSTEM_PROMPT`
      instructs the agent to keep the app consistent with it and to update it to
      reflect new intent.
- [x] The current `userdocumentation.md` is also passed as context so its updates
      are **incremental**, not rewritten blind; the agent maintains it as
      end-user how-to.
- [x] Both docs are read on app open (`loadAppFromDisk`) and available to the UI.
- [x] When an app window is open, the user can open a **read-only viewer** that
      renders each doc as markdown (reuse `core/markdown`, escape-first),
      reachable from the window title bar.
- [x] A new app's first generation **creates** both docs; a pure clarifying
      question (SAY, no changes) does **not** touch them.
- [x] Parsing/splitting (accepting the two doc paths, separating them from `src/`
      files, excluding them from the bundle) and the doc-context injection are
      covered by **unit tests**; the prompt change is covered by the prompt spec.

## Discussion

Decisions (interviewed 2026-08-08):

- **concept.md is a living spec, fed back** into generation (not description-only):
  the app's persistent memory, included as context each prompt and kept in sync.
  Rejected output-only (no continuity benefit).
- **Same generation** emits both docs (extend the FILE protocol to allow the two
  root paths), not a separate doc pass. Cheaper/simpler; accepts bigger per-prompt
  output. Rejected a second agent pass (doubles tokens + latency).
- **Every prompt** updates both docs (always current); accepts the extra
  output + context cost.
- **Read-only shell viewer** (reuse `core/markdown`), opened from the window title
  bar; LLM-maintained, the user doesn't edit. Rejected editable (needs a
  merge/clobber rule) and open-externally (leaves the app's window).
- Docs are **git-tracked** (unlike `chat.json`, which is ignored): they describe
  the app's state, so a revert should restore them too.

Open questions for planning:

- **Prompt-size budget:** both docs as context on every prompt grows the input —
  cap/trim long docs, or feed only `concept.md` as steering and pass
  `userdocumentation.md` only when it needs updating?
- **Viewer UX:** one "Docs" button with Concept / User-doc tabs vs two buttons;
  overlay panel like the versions panel vs a side pane.
- A later **editable concept.md** ("steer by editing the spec") could build on
  this read-only v1 — worth a follow-up card?
- Keep the card's file names (`concept.md`, `userdocumentation.md`) as-is.

Answered while implementing (2026-08-08):

- **Prompt-size budget:** both docs go into every prompt (the acceptance criteria
  ask for it), each capped at 12 000 chars in `buildPrompt` — a doc over the cap
  is cut at the end with a visible "(gekürzt …)" marker, so an outgrown doc can
  never blow up the prompt.
- **Viewer UX:** one 📄 button in the title bar opening an overlay `DocsPanel`
  with Konzept/Anleitung tabs — same shape as the versions panel; both overlays
  are mutually exclusive.
- **Follow-up:** c0036 (editable concept.md) captured in the inbox.

## Notes

Implementation:

- `core/docs.ts` — the two doc paths plus `splitDocs`/`applyDocs`/`toDocs`; the
  only place that knows `concept.md`/`userdocumentation.md`.
- `core/files.ts` — new `isValidOutputPath` (src/ **or** exactly the two docs)
  guards FILE blocks; DELETE still only accepts `src/` paths, so a doc can never
  be deleted.
- `core/prompt.ts` — SYSTEM_PROMPT section "DIE BEIDEN DOKUMENTE DER APP" plus
  rule 3 (nothing else outside `src/`); `buildPrompt` always emits both doc
  sections, with a "lege es an"-hint when a doc is still missing.
- `core/appstore.ts` — `readDocs`/`writeDocs`; `writeAppState` takes the docs, so
  they are committed with the app state (only `/chat.json` stays git-ignored).
- `electron/main.ts` — splits docs out of the parsed file set before
  `applyChanges`/`bundle` and returns the carried-forward docs; the renderer
  store keeps them in state and passes them back into the next generation.
- `components/DocsPanel.vue` — read-only markdown viewer (tabs), reached via 📄.

## Log

- 2026-08-08 status → discuss (app)
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
