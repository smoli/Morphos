---
id: c0038
title: File-Explorer
status: review
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T07:52:56
epic: e09
depends: [c0047, c0048, c0049, c0050]
usage-tokens: 7374
usage-cost: 0.928607
---

## Breakdown

Umbrella card — the work is split into four dependent sub-cards (see the e09
breakdown). This card is "done" when all four are:

1. **c0047** — system window in the desktop manager *(root)*
2. **c0048** — browse + live watch *(← c0047)*
3. **c0049** — content previews *(← c0048)*
4. **c0050** — file management + waste bin *(← c0048)*

The acceptance criteria below are the overall definition of done, split across
those cards.

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

- [x] Opens as a **window in the desktop window manager**: focus, z-order,
      minimize/maximize, dock entry, and app-switcher — like an app window.
- [x] Honors the desktop **mode switch**: floating in windowed mode, full-screen
      (with „← Desktop“) in single mode.
- [x] Opening it again **focuses the existing** explorer window (single instance),
      not a duplicate; there is a clear entry point (desktop / launcher / dock).

Browsing (confined + live):

- [x] Lists the **data folder** and subfolders with breadcrumb navigation and
      **cannot navigate above** the data root (scoped fs); empty/prompt state when
      no data folder is configured.
- [x] The listing **auto-refreshes** when files change (main-process watch,
      debounced); watching stops when the window closes.

Preview:

- [x] Passive types preview richly: **images**, **video**, **audio**,
      **markdown** (escape-first `core/markdown`), **JSON** (pretty-printed +
      syntax-highlighted), **text**.
- [x] **HTML/SVG** preview inside a **sandboxed iframe** (allow-scripts, no
      same-origin, CSP) — the same isolation as generated apps; no untrusted file
      runs in the trusted renderer.
- [x] Large/binary media load via a **scoped stream** (custom protocol or blob),
      not by inlining the whole file; oversized text/JSON is capped with a notice.
- [x] Unknown/unpreviewable types show file info (name, size, type) without
      trying to render.

Management (full, confined, user-driven):

- [x] **Create folder**, **rename**, **move**, and **copy/paste** work within the
      data folder; every operation is confined to the root (source **and**
      destination validated).
- [x] **Delete** moves items to a recoverable **waste bin** (hidden trash area
      inside the data folder), not a permanent delete; the user can **restore**
      from or **empty** the trash (empty = permanent, with confirmation).
- [x] Destructive actions (delete, empty trash, overwrite on move/copy) ask for
      **confirmation**; the trash is excluded from the normal listing.
- [x] Explorer operations are **user actions** (trusted shell), not app fs
      requests — they do not trigger the app permission dialog.

Tests:

- [x] Path confinement for move/copy (source + destination), trash round-trip
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

### Verification of the umbrella criteria (2026-08-09)

All four sub-cards are `done`; this card was closed by checking the overall
criteria against what they built, not by writing new code:

- **Window & modes** — `WindowKind = 'app' | 'system'` in `stores/desktop.ts`,
  `openSystem()` reuses an existing window with the same `systemId` (single
  instance). `SystemWindow.vue` renders inside the shared `WindowFrame`, so
  focus, z-order, minimize/maximize and the single-mode „← Desktop“ button are
  the same code as for app windows. Entry points: desktop button and launcher
  (`DesktopView.vue`, fed from `SYSTEM_WINDOWS`).
- **Browsing** — `ExplorerPanel.vue` lists `workspace.accessRoot` with
  breadcrumbs, prompts for a data folder when none is set; every path goes
  through `confineWithin`. Live refresh via `morphos:watch` →
  `FolderWatchers` (150 ms debounce, `stopAll(owner)` on window close).
- **Preview** — `core/preview.ts` (type detection, `TEXT_LIMIT` 512 KiB cap,
  pretty/highlighted JSON) plus `FilePreview.vue`: HTML/SVG in a blob iframe
  with `allow-scripts` and no `allow-same-origin`, media via the privileged
  `morphos-file://` scheme with range requests, unknown types fall back to
  file info.
- **Management** — `runShellFs` covers `newFolder`, `rename`, `move`, `copy`,
  `trash`, `trashList`, `restore`, `emptyTrash`; the trash is `.trash/files`
  + `.trash/meta` inside the data folder and is hidden from the listing by
  `isHiddenName`. Shell ops use the separate `morphos:shellFs` channel, so
  they never raise the app permission dialog.
- **Tests** — 64 files / 941 tests pass, `vue-tsc --noEmit` clean.

## Log

- 2026-08-08 status → discuss (app)
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 c0047–c0050 all done; umbrella criteria verified against the code,
  full test suite (941) and typecheck green (agent)
- 2026-08-09 status → review (agent)
