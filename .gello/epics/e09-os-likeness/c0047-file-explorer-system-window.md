---
id: c0047
title: "File-Explorer: system window in the desktop manager"
status: ready
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:18:11
order: 110
---

## What

Make the file explorer a **first-class window** in the desktop window manager — a
new **non-app „system“ window kind** that lives alongside app windows and behaves
like one, without being a generated app. This is the load-bearing piece the rest
of the explorer builds on.

## Acceptance criteria

- [ ] The desktop window manager (desktop store + WindowFrame) supports a
      **non-app „system“ window kind** whose body is a shell component, not an
      `AppCanvas`/generated app.
- [ ] The explorer window has full window behaviour: focus, z-order, minimize,
      maximize, dock entry, and app-switcher — same as an app window.
- [ ] It honors the desktop **mode switch**: floating in windowed mode,
      full-screen (with „← Desktop“) in single mode.
- [ ] A clear **entry point** opens it (desktop / launcher / dock); opening it
      again **focuses the existing** window (single instance), not a duplicate.
- [ ] The window hosts a placeholder explorer body (filled by c0048); window
      integration is covered by component tests (open, focus, mode behaviour,
      single-instance).

## Notes

- The „system window“ kind is reusable — other shell surfaces (docs, settings)
  could later be windows too, but that is out of scope here.

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
- 2026-08-08 status → ready (app)
