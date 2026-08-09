---
id: c0044
title: Restore session on restart
status: done
epic: e09
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T06:59:28
usage-tokens: 46588
usage-cost: 6.340484
---

## What

Remember which app **windows** were open and their **positions/sizes** (and mode:
windowed / single, maximized / minimized), and **reopen** them when Morphos
restarts, so the desktop comes back the way it was left.

## Acceptance criteria

- [x] The set of open windows + their geometry/state is **persisted** per
      workspace as it changes (open/close/move/resize/maximize/minimize).
- [x] On launch into a workspace, the persisted windows are **reopened** to their
      saved geometry and stacking; focus lands on the last-focused one.
- [x] Windows whose app no longer exists on disk are **skipped** gracefully (no
      crash, no empty window).
- [x] Unsaved **draft** windows are not restored (nothing to reload).
- [x] A first-run / empty session opens to the plain launcher (no restore).
- [x] Persist + restore logic covered by unit tests (serialize → restore round
      trip, with a missing-app case).

## Notes

- `src/core/session.ts` (rein, getestet): `serializeSession(fenster)` macht aus
  den offenen Fenstern eine Sitzung — **hinten → vorn** sortiert, das zuletzt
  fokussierte also zuletzt. Entwürfe ohne App-Id fallen weg (es gäbe nichts zu
  laden), von zwei Fenstern derselben App zählt das vordere, höchstens
  `MAX_SESSION_WINDOWS` (24). `restorableSession(sitzung, vorhandeneIds)` lässt
  Fenster verschwundener Apps aus; `cleanSessions` tütet den Stand von der
  Platte ein; `sameSession` verhindert Schreiben ohne Änderung.
- Titel und Icon werden **nicht** gemerkt: Sie kommen beim Wiederherstellen aus
  dem Verzeichnis (`AppSummary`) und sind damit stets aktuell.
- Persistenz je Workspace: `Settings.sessions[workspacePfad]`, im
  workspace-Store als `session`/`saveSession`; der Hauptprozess tütet beim Lesen
  und Schreiben mit `cleanSessions` ein. Eine leer gewordene Sitzung wird
  vergessen — dann öffnet der Desktop schlicht den Launcher.
- Der desktop-Store schreibt bei jeder Änderung (Öffnen, Schließen,
  Fokussieren, Minimieren, Maximieren, Entwurf→App). Ziehen und Größenändern
  melden jeden Mausschritt und laufen darum über `schedulePersistSession()`
  (300 ms Ruhe). Ein Klick in ein ohnehin vorderes Fenster schreibt nichts.
- `restoreSession()` läuft **einmal je Verzeichnis** und erst, wenn dessen Apps
  gelesen sind (`DesktopView.onMounted` nach `workspace.refresh()`) — vorher
  ließe sich nicht sagen, welche App es noch gibt. Sie öffnet die Fenster in
  gemerkter Reihenfolge (das letzte bekommt damit den Fokus) und hält am Ende
  fest, was wirklich offen ist: verschwundene Apps sind so auch aus der
  gemerkten Sitzung heraus.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 core/session + Sitzungs-Persistenz im workspace-/desktop-Store +
  Wiederherstellen beim Öffnen des Desktops umgesetzt (TDD); 621 Tests grün,
  `vue-tsc` und `npm run build` sauber — Commit d774a82
- 2026-08-08 status → review (agent)
- 2026-08-09 status → done (app)
