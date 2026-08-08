---
id: c0050
title: "File-Explorer: file management + waste bin"
status: backlog
epic: e09
depends: [c0048]
created: 2026-08-08
updated: 2026-08-08
---

## What

Full file **management** within the data folder — create folder, rename, move,
copy/paste, and **delete to a recoverable waste bin**. Everything confined to the
data root; operations are user actions in the trusted shell, not app fs requests.

## Acceptance criteria

- [ ] **Create folder**, **rename**, **move**, and **copy/paste** work within the
      data folder; every operation is confined to the root (**source and
      destination** validated).
- [ ] **Delete** moves items to a recoverable **waste bin** (a hidden trash area
      inside the data folder), not a permanent delete; the user can **restore**
      from and **empty** the trash (empty = permanent, with confirmation).
- [ ] Destructive actions (delete, empty trash, overwrite on move/copy) ask for
      **confirmation**; the trash is excluded from the normal listing.
- [ ] New scoped operations (**move/rename**, **copy**, **trash**) extend
      `core/fsaccess` / the `morphos:fs` IPC, guarded by `confineWithin` on every
      path; they are **user actions**, not app fs requests (no app permission
      dialog).
- [ ] Confinement for move/copy (source + destination) and the trash round-trip
      (delete → restore) are covered by unit tests.

## Notes

- Open question: do the app-facing `morphosFS` ops also gain move/copy, or stay
  explorer-only for now? (The `.trash/` folder is visible to apps' `list` unless
  filtered.)

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
