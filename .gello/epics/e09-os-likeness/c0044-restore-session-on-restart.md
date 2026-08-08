---
id: c0044
title: Restore session on restart
status: ready
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:11:49
order: 60
---

## What

Remember which app **windows** were open and their **positions/sizes** (and mode:
windowed / single, maximized / minimized), and **reopen** them when Morphos
restarts, so the desktop comes back the way it was left.

## Acceptance criteria

- [ ] The set of open windows + their geometry/state is **persisted** per
      workspace as it changes (open/close/move/resize/maximize/minimize).
- [ ] On launch into a workspace, the persisted windows are **reopened** to their
      saved geometry and stacking; focus lands on the last-focused one.
- [ ] Windows whose app no longer exists on disk are **skipped** gracefully (no
      crash, no empty window).
- [ ] Unsaved **draft** windows are not restored (nothing to reload).
- [ ] A first-run / empty session opens to the plain launcher (no restore).
- [ ] Persist + restore logic covered by unit tests (serialize → restore round
      trip, with a missing-app case).

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
