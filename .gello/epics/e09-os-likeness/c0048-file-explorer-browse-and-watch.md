---
id: c0048
title: "File-Explorer: browse + live watch"
status: done
epic: e09
depends: [c0047]
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T07:12:24
usage-tokens: 33789
usage-cost: 3.360524
---

## What

Browse the data folder inside the explorer window — a **confined** listing with
breadcrumb navigation that updates **live** as files change. Reuses the scoped
listing primitives from the file-dialog work (`core/dialog.ts`, `getHost().fs`).

## Acceptance criteria

- [x] Lists the **data folder** and subfolders with breadcrumb navigation;
      **cannot navigate above** the data root (scoped fs). Folders and files are
      distinguished and sortable by name.
- [x] Empty / prompt state when no data folder is configured.
- [x] The listing **auto-refreshes** on file changes via a **main-process folder
      watch** (debounced); the watch **stops when the window closes**.
- [x] Hidden/system entries (e.g. the future `.trash/` from c0050) are **excluded**
      from the normal listing.
- [x] Confined path resolution + the watch wiring are covered by tests (a change
      event triggers a re-list; a path above the root is rejected).

## Notes

- **`core/explorer`** holds the display rules (pure): hidden = leading dot (so
  the future `.trash/` is out for free), folders before files, name sort with an
  asc/desc toggle. Navigation reuses `core/dialog` (`breadcrumbs`, `parentDir`)
  and reading goes through `getHost().fs` — the same confined path as the file
  dialog, no second way into the filesystem.
- **`core/watch`** is the main-process side: `FolderWatchers` resolves every
  path through `confineWithin` (a path above the root is never watched),
  debounces bursts of `fs.watch` events into one message (150 ms), and books
  each watch under its window (`owner` = webContents id) so `stopAll` can end
  them with the window. The `fs.watch` call itself is injectable, so the
  registry is testable without timing luck; one test still exercises the real
  watcher against a tmp folder.
- **Wiring:** `morphos:watch` / `morphos:unwatch` + a `morphos:watchChanged`
  event; preload folds that into one host call
  `watchFolder(root, path, onChange) → unsubscribe`. The renderer never learns
  *what* changed, only *that* something did — it re-lists through the usual
  scoped read.
- **Three ways a watch ends:** the panel unmounts (window closed), the user
  navigates (old folder unwatched, new one watched), or the webContents dies
  (`stopAll`). A late `watchFolder` promise that resolves after a navigation
  unsubscribes itself.
- No data folder → the panel asks for one and opens the settings dialog
  instead of listing nothing.

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 implemented: `core/explorer` (listing rules), `core/watch`
  (confined, debounced folder watch in the main process),
  `morphos:watch`/`unwatch` + `host.watchFolder`, ExplorerPanel filled with
  breadcrumbs, sorting, live refresh and the no-data-folder prompt — 827 tests
  green (24 new), typecheck and build clean
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
