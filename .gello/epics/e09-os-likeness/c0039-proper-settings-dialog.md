---
id: c0039
title: Proper settings dialog
status: review
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:15:55
---

## What

Restructure „Einstellungen“ from a single flat modal into a **sectioned /
tabbed** dialog (sidebar categories), so it can grow into the home for new
settings (wallpaper, telemetry, keyboard-shortcut reference, …) without becoming
an unreadable wall. Keep the existing sections (Agenten, Datenordner,
Berechtigungen, Bibliotheken) working, just reorganized.

## Acceptance criteria

- [x] The settings dialog shows a **sidebar (or tabs) of categories**; selecting
      one shows only that section's content.
- [x] All existing settings still work unchanged: max agents, data folder,
      per-function permissions, library whitelist.
- [x] There is a clear extension point so a new category can be added by
      registering a section (no rewrite per addition).
- [x] The dialog is still opened from the ⚙ button and closes via ✕ / backdrop.
- [x] Component tests cover category switching and that each existing setting is
      reachable and still mutates the workspace store.

## Notes

`SettingsDialog.vue` is now only the shell: header with ✕, a sidebar of
categories (`role="tablist"`, `.cat` buttons) and a `.pane` that renders the
active section via `<component :is>`. It knows no setting itself.

**Extension point** — `src/components/settings/sections.ts` holds
`SETTINGS_SECTIONS: SettingsSection[]` (`{ id, label, icon, component }`). A new
category = a component in `src/components/settings/` + one entry in that list.
The dialog also takes the list as an optional `sections` prop (defaulting to the
registry), which is what the test uses to prove registration alone suffices.

The four existing sections moved into `settings/AgentsSection.vue`,
`DataFolderSection.vue`, `PermissionsSection.vue`, `LibrariesSection.vue`
(markup and store calls unchanged); their shared look lives in
`settings/settings.css`, pulled in per section via `<style scoped src>`.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 Einstellungen in Schale + registrierte Bereiche zerlegt; 9 Tests in
  `SettingsDialog.spec.ts` (Kategoriewechsel, Registrierung, jede Einstellung);
  Gesamtsuite 522 Tests grün, `vue-tsc` sauber
- 2026-08-08 status → review (agent)
