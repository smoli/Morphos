---
id: c0038
title: File-Explorer
status: discuss
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T22:51:33
epic: e09
---

## What

A first-class **file manager** for the workspace data folder (`accessRoot`),
behaving like a built-in app: it opens as a **window in the desktop window
manager**, honors the mode switch (floating in windowed mode, full-screen in
single mode), and appears in the dock / app-switcher. It **browses** the data
folder (confined, never above the root), **previews** what the browser can
display, and offers full file **management** — create folder, rename, move,
copy/paste, and delete to a recoverable **waste bin**. Content is not edited (no
text editor); this is a viewer + manager. The listing updates **live**.

## Acceptance criteria

Window & modes:

- [ ] Opens as a **window in the desktop window manager**: focus, z-order,
      minimize/maximize, dock entry, and app-switcher — like an app window.
- [ ] Honors the desktop **mode switch**: floating in windowed mode, full-screen
      (with „← Desktop“) in single mode.
- [ ] Opening it again **focuses the existing** explorer window (single instance),
      not a duplicate; there is a clear entry point (desktop / launcher / dock).

Browsing (confined + live):

- [ ] Lists the **data folder** and subfolders with breadcrumb navigation and
      **cannot navigate above** the data root (scoped fs); empty/prompt state when
      no data folder is configured.
- [ ] The listing **auto-refreshes** when files change (main-process watch,
      debounced); watching stops when the window closes.

Preview:

- [ ] Passive types preview richly: **images**, **video**, **audio**,
      **markdown** (escape-first `core/markdown`), **JSON** (pretty-printed +
      syntax-highlighted), **text**.
- [ ] **HTML/SVG** preview inside a **sandboxed iframe** (allow-scripts, no
      same-origin, CSP) — the same isolation as generated apps; no untrusted file
      runs in the trusted renderer.
- [ ] Large/binary media load via a **scoped stream** (custom protocol or blob),
      not by inlining the whole file; oversized text/JSON is capped with a notice.
- [ ] Unknown/unpreviewable types show file info (name, size, type) without
      trying to render.

Management (full, confined, user-driven):

- [ ] **Create folder**, **rename**, **move**, and **copy/paste** work within the
      data folder; every operation is confined to the root (source **and**
      destination validated).
- [ ] **Delete** moves items to a recoverable **waste bin** (hidden trash area
      inside the data folder), not a permanent delete; the user can **restore**
      from or **empty** the trash (empty = permanent, with confirmation).
- [ ] Destructive actions (delete, empty trash, overwrite on move/copy) ask for
      **confirmation**; the trash is excluded from the normal listing.
- [ ] Explorer operations are **user actions** (trusted shell), not app fs
      requests — they do not trigger the app permission dialog.

Tests:

- [ ] Path confinement for move/copy (source + destination), trash round-trip
      (delete → restore), and preview type-detection are covered by unit tests;
      the window + previews by component tests (sandboxed iframe for HTML, escaped
      JSON/text).

## Discussion

Decisions (interviewed 2026-08-08):

- **Behaves like an app window:** first-class in the desktop window manager and
  honors windowed/single mode + dock + switcher. Implies the window layer must
  host a **non-app „system“ window** (a new window *kind* alongside app windows) —
  the main architectural lift.
- **Sandboxed-iframe preview** for HTML/SVG (reuse the AppCanvas sandbox), rich
  preview for passive types. Rejected source-text-only.
- **Full file management** — create folder, rename, move, copy/paste, delete —
  overriding the card's original „No editing“ (which now means no *content*
  editing; a text editor is out). Delete uses a **recoverable waste bin** inside
  the data folder, not permanent removal.
- **Live auto-refresh** via a main-process folder watch. Rejected manual-only.

Scope grew a lot — effectively a small file-manager app. New fs capabilities are
needed beyond today's bridge: **move/rename**, **copy**, a **trash** area, a
**watch** channel, and a **scoped media stream**, plus the **system-window**
concept in the desktop store / WindowFrame.

Open questions for planning:

- **Break into sub-cards?** Suggested split: (1) system-window in the window
  manager, (2) browse + live watch, (3) previews incl. sandboxed HTML + media
  stream, (4) management ops (move/copy/rename/mkdir) + waste bin. This card is
  arguably a mini-epic.
- Preview **size caps** and which media formats are guaranteed (mp4/webm, …).
- Do the app-facing `morphosFS` ops also gain move/copy, or explorer-only for
  now? (The `.trash/` folder is visible to apps' listing unless filtered.)
- Single explorer instance forever, or multiple windows later?

## Notes

- Reuses the scoped listing primitives from the file-dialog work
  (`core/dialog.ts` confinement, `getHost().fs(...)` listing); the explorer is a
  non-modal, richer superset.
- New scoped operations (move / copy / watch / stream, trash) extend
  `core/fsaccess` and the `morphos:fs` IPC, all guarded by `confineWithin` on
  every path.

## Log

- 2026-08-08 status → discuss (app)
