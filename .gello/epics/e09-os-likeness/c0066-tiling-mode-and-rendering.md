---
id: c0066
title: "Tiling: Kacheln mode + tree-derived rendering"
status: review
epic: e09
depends: [c0065]
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T19:55:13
usage-tokens: 45957
usage-cost: 6.679163
---

## What

Wire the split-tree engine (c0065) into the desktop as a **third mode „Kacheln“**:
windows tile with no overlap, their geometry **derived from the tree**, and the
usual lifecycle (open splits the focused tile, close/minimize reflow) flows
through the engine.

## Acceptance criteria

- [x] A third mode **„Kacheln“** joins the Fenster/Einzeln switch and is
      **persisted** like `uiMode`; entering it tiles the currently-open windows.
- [x] Each tiled window's position/size is **computed from the tree** (c0065) over
      the desktop area minus gaps; **no free move/resize** and **no overlap** in
      this mode.
- [x] **Opening** an app splits the focused tile; **closing** collapses its node;
      **minimizing** removes it (to the dock) and reflows; **restoring** re-inserts
      it — all via the engine.
- [x] **Maximize** fullscreens a tile temporarily (and restores back into the
      layout).
- [x] The desktop store holds the **per-workspace tiling tree** as reactive state;
      windows re-render on any tree change.
- [x] Component/store tests: switching to Kacheln tiles N windows without overlap;
      open/close/minimize update the layout correctly.

## Notes

- Geometry shifts from free `x/y/w/h` (windowed mode) to tree-derived; the window
  frame reads its rect from the tree rather than its own drag state in this mode.

Der dritte Modus heißt **„Kacheln“** (`uiMode: 'tiles'`) und steht neben
Fenster/Einzeln in der Kopfleiste. Was er umfasst:

- `src/core/uimode.ts` (neu) — die drei Darstellungen an einer Stelle, mit
  `cleanUiMode()`. Es gab die Prüfung `=== 'single' ? …` vorher dreimal
  wörtlich (Workspace-Store, `readSettings`, `saveSettings`); jetzt fällt eine
  unbekannte Darstellung überall gleich auf `windows` zurück — sonst wäre
  `tiles` beim Speichern wieder verlorengegangen.
- `stores/desktop` hält den Baum je Arbeitsverzeichnis (`tiles`) und die
  gemessene Fläche (`tileArea`); `tileTree`/`tileRects` sind reine Getter,
  darum zeichnen sich die Fenster bei jeder Änderung neu. `syncTiles(focus?)`
  ist der **einzige** Weg, auf dem der Baum sich ändert: Öffnen, Schließen,
  Minimieren, Wiederherstellen und das Ende der Sitzungswiederherstellung rufen
  ihn selbst, der Desktop beim Wechsel des Modus. `moveWindow`/`resizeWindow`
  sind im Kachel-Modus stumm — freies Verschieben gibt es nicht.
- Der Brennpunkt für die Teilung steht **vor** dem Anlegen fest: Ein neues
  Fenster kommt ja sofort nach vorn und wäre sonst sein eigener Brennpunkt.
- `views/DesktopView` misst die freie Fläche jetzt mitsamt ihrer Lage
  (`offsetLeft/offsetTop` — ein Dock an der Seite rückt sie ein) und rückt sie
  ringsum um eine Fuge ein: zwischen zwei Kacheln steht so viel Luft wie zum
  Rand. Als Fugenbreite gilt `DEFAULT_GAP = 12` aus c0065.
- `components/WindowFrame` liest sein Rechteck über `tiled` aus `tileRects`;
  maximiert bleibt es beim alten `full` — der Baum wird dabei nicht angefasst,
  darum kehrt das Fenster in dieselbe Kachel zurück. `.window-frame.tiled` hebt
  die Mindestgröße auf, die sich sonst über eine schmale Kachel hinausschöbe.
- Noch offen und ausdrücklich in c0067: an der Fuge ziehen und Kacheln
  tauschen. Der Baum kann beides schon (`setRatio`, `swapLeaves`).

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 Kachel-Modus umgesetzt: core/uimode, Baum im Desktop-Store,
  tree-derived Geometrie im WindowFrame, Fläche + Umschalten in DesktopView
  (1224 Tests grün, typecheck + build sauber)
- 2026-08-09 status → review (agent)
