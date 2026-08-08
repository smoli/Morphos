---
id: c0048
title: "File-Explorer: browse + live watch"
status: ready
epic: e09
depends: [c0047]
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:18:14
order: 120
---

## What

Browse the data folder inside the explorer window — a **confined** listing with
breadcrumb navigation that updates **live** as files change. Reuses the scoped
listing primitives from the file-dialog work (`core/dialog.ts`, `getHost().fs`).

## Acceptance criteria

- [ ] Lists the **data folder** and subfolders with breadcrumb navigation;
      **cannot navigate above** the data root (scoped fs). Folders and files are
      distinguished and sortable by name.
- [ ] Empty / prompt state when no data folder is configured.
- [ ] The listing **auto-refreshes** on file changes via a **main-process folder
      watch** (debounced); the watch **stops when the window closes**.
- [ ] Hidden/system entries (e.g. the future `.trash/` from c0050) are **excluded**
      from the normal listing.
- [ ] Confined path resolution + the watch wiring are covered by tests (a change
      event triggers a re-list; a path above the root is rejected).

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
- 2026-08-08 status → ready (app)
