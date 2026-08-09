---
id: c0042
title: Telemetry — agent activity & disk usage
status: review
epic: e09
depends: [c0039]
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T00:20:05
usage-tokens: 43615
usage-cost: 5.929118
---

## What

A light **telemetry** view in settings: how much **agent activity** is happening
(running / queued, maybe recent runs) and how much **disk** the apps and data
folder use (per-app sizes + total), so the user has a feel for cost and storage.

## Acceptance criteria

- [x] A settings section shows current **agent activity**: running + queued
      counts (and, if available, recent runs) sourced from the agent queue.
- [x] A **disk-usage** view lists per-app folder sizes and the data-folder total,
      computed in the **main process** (folder-size IPC) — the renderer never
      walks the filesystem itself.
- [x] Sizes are human-readable (KB/MB) and refresh on open (or via a refresh
      action); computing them does not block the UI.
- [x] Disk usage covers the workspace's apps and the data folder only — nothing
      outside.
- [x] The folder-size computation is covered by unit tests (a temp tree of known
      sizes); the activity view by a component test with a stubbed queue.

## Notes

- "Agent activity" reads from the agent queue introduced in **e07 · c0030** —
  nicer once that lands, but the disk-usage half is independent.
- Umgesetzt als Einstellungs-Bereich **„Telemetrie“**
  (`components/settings/TelemetrySection.vue`), registriert in `sections.ts`:
  oben laufende/wartende Läufe samt Deckel und die Liste der Aufträge, darunter
  „Zuletzt gelaufen“, darunter der Platzbedarf mit Balken je App, Summe und
  Datenordner.
- **Zuletzt gelaufen**: Die Warteschlange (`stores/agents`) merkt sich jetzt die
  jüngsten erledigten Läufe (`recent`, Deckel `MAX_RECENT_RUNS` in `core/queue`);
  abgebrochene Läufe stehen nicht darin.
- **Gerechnet wird im Hauptprozess**: `core/diskusage` (`folderSize`,
  `collectDiskUsage`) läuft über die Ordner, `morphos:diskUsage` reicht das
  Ergebnis durch. Der Hauptprozess vermisst nur ein Arbeitsverzeichnis aus den
  gespeicherten `recentFolders` und dessen `accessRoot` — ein beliebiger Pfad aus
  dem Renderer wird nicht angefasst. Symlinks werden übergangen, damit ein
  Verweis nach draußen nicht mitgemessen wird.
- `core/bytes.formatBytes` ist die Renderer-taugliche Hälfte (kein `node:fs`) —
  deshalb liegt die Formatierung getrennt von der Messung.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 umgesetzt: core/bytes + core/diskusage (Temp-Baum-Tests),
  IPC morphos:diskUsage, „zuletzt gelaufen“ in stores/agents, Bereich
  „Telemetrie“ in den Einstellungen; 766 Tests grün, typecheck + build sauber
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 status → review (agent)
