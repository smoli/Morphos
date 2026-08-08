---
id: c0046
title: Keyboard shortcuts + app switcher
status: ready
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:11:55
order: 80
---

## What

Make the desktop drivable from the **keyboard**: global shortcuts for common
actions (new app, close / minimize / maximize the active window, open settings,
open the launcher) and a **Cmd·Ctrl+Tab app switcher** overlay that cycles the
open windows.

## Acceptance criteria

- [ ] A defined set of **global shortcuts** works from the desktop (e.g. new app,
      close/minimize active window, open settings, open launcher) — documented in
      one place.
- [ ] **Cmd·Ctrl+Tab** opens a switcher overlay listing open windows; holding and
      repeating Tab cycles the selection; release **activates** the selected
      window (most-recently-used order).
- [ ] Shortcuts do **not** fire while typing in the prompt/inputs or inside an app
      iframe (focus-aware).
- [ ] The switcher is a no-op with zero or one open window.
- [ ] Shortcut mapping + switcher cycle order (pure logic) covered by unit tests;
      the overlay by a component test.

## Notes

- Shortcuts are renderer-level (keydown), not OS-global accelerators, so they only
  act while Morphos is focused.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
