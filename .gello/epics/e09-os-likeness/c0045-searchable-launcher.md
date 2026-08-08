---
id: c0045
title: Searchable launcher
status: ready
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:11:51
order: 70
---

## What

A **start-menu / spotlight**-style overlay to find and open apps by typing,
beside the icon grid — keyboard-first, for when there are too many apps to scan
visually.

## Acceptance criteria

- [ ] An overlay opens from a launcher control **and** a keyboard shortcut; it has
      a search field focused on open.
- [ ] Typing **filters** the workspace's apps (by name) live; results are
      keyboard-navigable (↑/↓) and **Enter opens** the highlighted app (focusing
      its window if already open).
- [ ] There is a **„Neue App“** entry / action in the launcher.
- [ ] **Esc** closes the overlay; it closes after opening an app.
- [ ] Filtering + selection logic (pure) is covered by unit tests; the overlay by
      a component test (type → Enter → openApp called).

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
