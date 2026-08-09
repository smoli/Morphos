---
id: c0046
title: Keyboard shortcuts + app switcher
status: review
epic: e09
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T00:00:32
usage-tokens: 48180
usage-cost: 5.887724
---

## What

Make the desktop drivable from the **keyboard**: global shortcuts for common
actions (new app, close / minimize / maximize the active window, open settings,
open the launcher) and a **Cmd·Ctrl+Tab app switcher** overlay that cycles the
open windows.

## Acceptance criteria

- [x] A defined set of **global shortcuts** works from the desktop (e.g. new app,
      close/minimize active window, open settings, open launcher) — documented in
      one place.
- [x] **Cmd·Ctrl+Tab** opens a switcher overlay listing open windows; holding and
      repeating Tab cycles the selection; release **activates** the selected
      window (most-recently-used order).
- [x] Shortcuts do **not** fire while typing in the prompt/inputs or inside an app
      iframe (focus-aware).
- [x] The switcher is a no-op with zero or one open window.
- [x] Shortcut mapping + switcher cycle order (pure logic) covered by unit tests;
      the overlay by a component test.

## Notes

- Shortcuts are renderer-level (keydown), not OS-global accelerators, so they only
  act while Morphos is focused.
- The mapping lives in `src/core/shortcuts.ts` — the single place — and is shown to
  the user as a new „Tastenkürzel“ section in the settings dialog:
  Strg/⌘ + K Startmenü · + N neue App · + , Einstellungen · + ⇧ + W schließen ·
  + ⇧ + M minimieren · + ⇧ + F maximieren, plus Strg/⌘ + Tab zum Fensterwechsel.
- **Why the ⇧ on the window commands:** ⌘/Strg + W and + M belong to the Electron
  host window (default menu accelerators) and would close/minimize Morphos itself
  before the renderer ever sees them. The desktop's own window commands therefore
  carry the shift key.
- **macOS:** ⌘ + Tab is taken by the system app switcher, so on a Mac the window
  switcher answers to Strg + Tab (both chords are accepted).
- Focus-awareness is literal, as specified: with the caret in the prompt bar no
  shortcut fires (not even ⌘K). Worth revisiting if it feels restrictive in daily
  use — the prompt bar holds focus a lot.
- Switcher state machine: opening selects index 0 (the current window) and
  immediately steps, so one Tab lands on the previously used window; ⇧ walks
  backwards, Escape and losing the window's focus abort without switching.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 implemented: core/shortcuts + core/switcher (pure), SwitcherOverlay,
  desktop key dispatch, shell store for the settings dialog, settings cheat sheet
  — 700 tests green, typecheck clean
- 2026-08-09 status → review (agent)
