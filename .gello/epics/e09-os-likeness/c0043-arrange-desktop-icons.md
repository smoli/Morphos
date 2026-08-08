---
id: c0043
title: Arrange desktop icons
status: in-progress
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:21:01
---

## What

Let the user **freely position** the app icons on the desktop surface (drag them
around) instead of only an auto-flowing grid, and remember the arrangement per
workspace. The auto grid stays as the fallback for apps with no saved position.

## Acceptance criteria

- [ ] App tiles on the desktop can be **dragged** to a position and dropped;
      dragging a tile does not trigger "open app".
- [ ] Positions are **persisted per workspace** and restored on reload/restart.
- [ ] Apps without a saved position fall back to a sensible **auto layout**
      (current grid); newly created apps get placed without overlap.
- [ ] An action to **tidy / reset** the arrangement back to the grid.
- [ ] Icons stay within the desktop bounds (not lost off-screen after a resize).
- [ ] Position persistence + fallback layout covered by tests.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
