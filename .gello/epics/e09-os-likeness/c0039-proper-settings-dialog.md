---
id: c0039
title: Proper settings dialog
status: in-progress
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:11:56
---

## What

Restructure „Einstellungen“ from a single flat modal into a **sectioned /
tabbed** dialog (sidebar categories), so it can grow into the home for new
settings (wallpaper, telemetry, keyboard-shortcut reference, …) without becoming
an unreadable wall. Keep the existing sections (Agenten, Datenordner,
Berechtigungen, Bibliotheken) working, just reorganized.

## Acceptance criteria

- [ ] The settings dialog shows a **sidebar (or tabs) of categories**; selecting
      one shows only that section's content.
- [ ] All existing settings still work unchanged: max agents, data folder,
      per-function permissions, library whitelist.
- [ ] There is a clear extension point so a new category can be added by
      registering a section (no rewrite per addition).
- [ ] The dialog is still opened from the ⚙ button and closes via ✕ / backdrop.
- [ ] Component tests cover category switching and that each existing setting is
      reachable and still mutates the workspace store.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
