---
id: c0047
title: "File-Explorer: system window in the desktop manager"
status: done
epic: e09
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T07:01:03
usage-tokens: 58130
usage-cost: 7.187773
---

## What

Make the file explorer a **first-class window** in the desktop window manager — a
new **non-app „system“ window kind** that lives alongside app windows and behaves
like one, without being a generated app. This is the load-bearing piece the rest
of the explorer builds on.

## Acceptance criteria

- [x] The desktop window manager (desktop store + WindowFrame) supports a
      **non-app „system“ window kind** whose body is a shell component, not an
      `AppCanvas`/generated app.
- [x] The explorer window has full window behaviour: focus, z-order, minimize,
      maximize, dock entry, and app-switcher — same as an app window.
- [x] It honors the desktop **mode switch**: floating in windowed mode,
      full-screen (with „← Desktop“) in single mode.
- [x] A clear **entry point** opens it (desktop / launcher / dock); opening it
      again **focuses the existing** window (single instance), not a duplicate.
- [x] The window hosts a placeholder explorer body (filled by c0048); window
      integration is covered by component tests (open, focus, mode behaviour,
      single-instance).

## Notes

- The „system window“ kind is reusable — other shell surfaces (docs, settings)
  could later be windows too, but that is out of scope here.
- **Frame split.** `WindowFrame` is now the *chrome* only — geometry, drag,
  resize, focus, window buttons, „← Desktop“ — with slots for `icon`, `title`,
  `actions` and the body. The app half moved into a new `AppWindow` (instance
  store, `AppCanvas`, versions, docs, icon dialog); `SystemWindow` is its
  sibling for shell surfaces. Same DOM as before, so the window CSS/behaviour is
  unchanged. `WindowFrame.spec` now covers the chrome standalone,
  `AppWindow.spec` is the old spec (git mv).
- `core/system.ts` is the registry of shell surfaces (id, title, icon) —
  currently just `explorer` („Dateien“ 📁). `desktop.openSystem(id)` focuses an
  existing window or spawns one; unknown ids open nothing.
- **Entry points:** a „📁 Dateien“ button in the desk tools next to „🔍 Suchen“,
  plus an entry in the launcher search (`core/launcher` gained a `system` kind,
  the overlay a `system` event). Dock and app-switcher come for free — it is a
  window like any other.
- **The prompt bar does not talk to shell windows.** A new getter
  `desktop.activeAppId` is `activeId` minus system windows; `submitToActive`
  falls back to a fresh draft, so typing a wish while the explorer is in front
  creates a new app instead of trying to „develop“ the explorer.
- **Not restored on restart:** the session only remembers windows that can be
  reconstructed from disk (an app id + geometry, see `core/session`), so the
  explorer window is deliberately left out. Reopening it is one click; adding it
  would mean a second kind of session entry.

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 implemented: `core/system` registry, `kind`/`systemId` +
  `openSystem()`/`activeAppId` in the desktop store, WindowFrame split into
  chrome + AppWindow + SystemWindow, ExplorerPanel placeholder, entry points on
  the desktop and in the launcher — 803 tests green, typecheck clean
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
