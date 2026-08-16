---
id: c0097
title: "Standalone morphosFS runtime (OPFS/IndexedDB)"
status: backlog
epic: e14
depends: []
created: 2026-08-16
updated: 2026-08-16
tags: [hosting, sandbox, fs]
order: 20
---

# Standalone morphosFS runtime (OPFS/IndexedDB)

The core of e14: a `window.morphosFS` that needs **no parent shell**, backed by a
per-origin **virtual filesystem** (OPFS, with an IndexedDB fallback). Drop-in for
the shell's `postMessage` bridge (`src/core/appfs.ts`), so an app written for
Morphos runs unchanged when hosted.

## What

Implement the full `morphosFS` surface against a virtual fs:

- **fs**: `readFile`, `writeFile`, `list`, `exists`, `stat`, `mkdir`, `remove` —
  same paths/semantics/errors as the shell contract (`ALLOWED_OPS`).
- **dialogs**: `openFile`, `saveFile`, `pickDirectory` — presented over the
  **virtual fs** via a minimal in-app picker (not the real disk).

Storage is OPFS where available, IndexedDB otherwise; both need a secure context
(covered by e14's https target). No network, no real-disk access.

## Acceptance criteria

- [ ] `window.morphosFS` exposes **all seven fs ops** with the same argument and
      return contract as the shell bridge, backed by OPFS/IndexedDB.
- [ ] Paths, errors and edge cases (missing file, list of a non-dir, mkdir of an
      existing path, remove of a tree) match the shell's `ALLOWED_OPS` behaviour.
- [ ] The **three dialogs** work against the virtual fs via a minimal in-app
      picker, returning paths the fs ops accept.
- [ ] Data **persists** across reloads (OPFS/IndexedDB), and is **per-origin
      isolated**.
- [ ] Uses **no parent `postMessage`** and no real-disk API; runs standalone in a
      page.
- [ ] fs semantics covered by **unit tests** against the virtual backing (mock/
      in-memory OPFS acceptable).

## Notes

- Mirror the contract in `src/core/appfs.ts` (`BRIDGE_SDK`, `ALLOWED_OPS`,
  `FsOp`). Keep the path/op/validation logic pure and shared with the shell where
  possible; only the transport (postMessage → OPFS) differs. The picker UX is an
  open question in the epic — a minimal design lives here.

## Log

- 2026-08-16 created from the e14 epic breakdown (promoted from c0089)
