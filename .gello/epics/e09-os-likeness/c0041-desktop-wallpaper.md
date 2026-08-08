---
id: c0041
title: Desktop wallpaper
status: ready
epic: e09
depends: [c0039]
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:11:44
order: 30
---

## What

Let the user set a **background** for the desktop surface — a solid color/gradient
or an image. Configured in the (revamped) settings, rendered behind the launcher
and windows, and persisted per workspace so it survives restarts.

## Acceptance criteria

- [ ] Settings offers a **wallpaper** section: pick a color/gradient or choose an
      image file.
- [ ] The chosen wallpaper renders as the **desktop background** (behind the
      launcher grid and windows) and does not interfere with clicking tiles or
      windows.
- [ ] The setting is **persisted** (survives restart); a sensible default applies
      when none is set.
- [ ] An image wallpaper is stored so it reloads offline (e.g. copied into the
      workspace / userData, or a data-URI with a size cap) — no external URL.
- [ ] A way to **reset** to the default background.
- [ ] Persistence + apply logic covered by tests.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
