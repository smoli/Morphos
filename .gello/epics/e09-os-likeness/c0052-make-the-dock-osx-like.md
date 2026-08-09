---
id: c0052
title: Make the dock OSX like
status: review
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T09:45:02
epic: e09
depends: [c0055, c0056]
---

## What

Turn the bottom dock into a **macOS-style dock**. Left → right it holds: the
pinned **＋ New-App** (always there), the user's **favorite** apps (pinned,
stay even when closed), then any **running** apps not already pinned — each
running app carries a **running indicator**. It replaces today's
minimized-only dock; a minimized app is reachable from its dock item.

## Acceptance criteria

- [x] The dock shows, in order: the **＋ New-App** pin, then **favorites**, then
      **running** apps not already pinned; an app that is both favorite and
      running appears **once** (with the running indicator).
- [x] The launcher grid **no longer** contains a ＋ New-App tile — the ＋ lives
      only in the dock *(merged c0053)*.
- [x] A **running indicator** marks currently-open apps; a favorite that isn't
      running shows without it.
- [x] Clicking a dock item **focuses** the app's window, **restoring** it if
      minimized; clicking ＋ starts a new app. **No** minimize-on-second-click.
- [x] Apps can be **pinned / unpinned** as favorites via the icon context menu
      (c0055, „Im Dock behalten“); favorites **persist per workspace** in Settings.
- [x] Each dock item shows the app's icon (emoji or image) and its name on
      hover/tooltip.
- [x] The dock **replaces** the old minimized-only dock (minimized apps live here
      now).
- [x] Dock composition (order, favorite/running/duplicate handling) is pure logic
      covered by unit tests; rendering + click by component tests.

## Notes

- **`src/core/dock.ts`** (neu) stellt die Plätze auf: Lieblinge in ihrer
  Reihenfolge, dahinter die übrigen laufenden Fenster in ihrer; jede App genau
  einmal. Titel und Icon kommen aus dem Verzeichnis (frischester Stand), sonst
  vom Fenster. Gelöschte Apps, die noch in den Einstellungen stehen, fallen weg.
  10 Unit-Tests in `src/core/dock.spec.ts`.
- Das **＋** ist kein Listeneintrag — es ist weder App noch Fenster und steht als
  fester Knopf (`.dock-item.new`) vor der Liste, abgesetzt durch einen Strich.
- **Offene Frage „System-Fenster im Dock?“ entschieden:** Fenster ohne App (der
  Datei-Explorer, ein frischer Entwurf) stehen als *laufende* Plätze mit im
  Dock — sonst wäre ein minimiertes von ihnen nirgends mehr zu erreichen. Sie
  lassen sich **nicht** behalten: Ihr Rechtsklick öffnet gar kein Menü, denn nur
  eine App des Verzeichnisses kann ein Liebling sein.
- **Favoriten-Scope: je Workspace** (wie `iconPositions`/`sessions`) — kam mit
  c0055 (`core/favorites`, `stores/workspace`) schon so an und bleibt so.
- Aussehen: schwebende Leiste unten mittig, nur Glyphen (48 px), Name als
  Sprechblase beim Überfahren (plus `title`-Tooltip), Laufpunkt unter dem Icon,
  Arbeitsanzeige (BusyDot) oben rechts. Im Einzel-Modus erscheint das Dock
  weiterhin nur auf dem Desktop, nicht über der Vollbild-App.
- Der Rasterplatz 0 ist frei geworden (`arrangeIcons` ohne `reserved`) — Kacheln
  ohne gemerkte Position beginnen wieder oben links; der Hinweistext für ein
  leeres Verzeichnis zeigt aufs Dock.
- Geprüft: `npx vitest run` (1016 Tests grün) und `npx vue-tsc --noEmit`. Ein
  Lauf in der echten Electron-App fand nicht statt (Ordnerauswahl ist ein
  nativer Dialog) — belegt ist alles über die Komponententests.

## Discussion

Decisions (interviewed 2026-08-09, Cluster A):

- **Contents = ＋ pin + favorites + running.** Rejected running-only and a
  minimal ＋-only dock. Favorites are a new persisted concept (per workspace,
  like `iconPositions` / `sessions`).
- **Click = focus / restore only.** Rejected the macOS minimize-on-second-click
  toggle for v1 (can add later).
- One item **per app** (opening an app focuses its single window), so the dock is
  app-level, not window-level.

Open questions for planning:

- Favorites **scope**: per-workspace (recommended, matches icon positions) vs
  global.
- Does the **file-explorer system window** (c0047) appear in the dock / be
  pinnable? (It's a system window, not an app.)
- **c0053 merged in** (2026-08-09): the grid→dock move of the ＋ is an acceptance
  criterion above; c0053 has been archived.
- Assumes the bottom edge is free — depends on the composer moving out of the way
  (Cluster B / c0056).

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → discuss (app)
- 2026-08-09 depends [c0055, c0056] + status → backlog (shell build sequence)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 core/dock.ts + Spec (rot → grün), Dock in DesktopView neu gebaut,
  ＋ aus dem Raster ins Dock, System-Fenster-Frage entschieden (Notes)
- 2026-08-09 status → review (agent)
