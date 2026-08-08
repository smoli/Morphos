---
id: c0043
title: Arrange desktop icons
status: done
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:31:58
usage-tokens: 41548
usage-cost: 4.91057
---

## What

Let the user **freely position** the app icons on the desktop surface (drag them
around) instead of only an auto-flowing grid, and remember the arrangement per
workspace. The auto grid stays as the fallback for apps with no saved position.

## Acceptance criteria

- [x] App tiles on the desktop can be **dragged** to a position and dropped;
      dragging a tile does not trigger "open app".
- [x] Positions are **persisted per workspace** and restored on reload/restart.
- [x] Apps without a saved position fall back to a sensible **auto layout**
      (current grid); newly created apps get placed without overlap.
- [x] An action to **tidy / reset** the arrangement back to the grid.
- [x] Icons stay within the desktop bounds (not lost off-screen after a resize).
- [x] Position persistence + fallback layout covered by tests.

## Notes

- `src/core/arrange.ts` (rein, getestet): Rasterweite, Spaltenzahl aus der
  Fläche, `arrangeIcons(ids, saved, bounds, reserved)` — gemerkte Positionen
  bleiben (in die Fläche geholt), alles übrige bekommt den nächsten **freien**
  Rasterplatz. Eine frei abgelegte Kachel belegt den Platz, auf dem sie sitzt;
  darum weicht eine neue App ihr aus. `reserved = 1` hält den ersten Platz für
  die feste „Neue App“-Kachel frei.
- Persistenz je Workspace: `Settings.iconPositions[workspacePfad][appId]`, im
  workspace-Store als `iconLayout`/`setIconPosition`/`resetIconPositions`; der
  Hauptprozess tütet die Werte beim Lesen und Schreiben auf Zahlenpaare ein.
  Eine gelöschte App vergisst ihre Position.
- **Aufräumen** löscht die gemerkten Positionen des Workspace — das Raster ist
  der Fallback, es muss also nichts hingeschrieben werden.
- Die Fläche wird gemessen (ResizeObserver, sonst `resize`); jede Position wird
  beim Anordnen in die Fläche geklemmt. Eine Kachel geht damit auch dann nicht
  verloren, wenn das Fenster schrumpft — beim Vergrößern liegt sie wieder an
  ihrer alten Stelle.
- Klick ≠ Ziehen: Erst ab 4 px Mausweg wird gezogen; der Klick, den das
  Loslassen hinterherschickt, öffnet die App nicht.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 core/arrange + Persistenz im workspace-Store + freies Ablegen auf
  dem Desktop umgesetzt (TDD); 577 Tests grün, `vue-tsc` sauber — Commit 6c88a04
- 2026-08-08 status → review (agent)
- 2026-08-08 status → done (app)
