---
id: c0067
title: "Tiling: gap-drag resize + swap-drag"
status: review
epic: e09
depends: [c0066]
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T20:33:50
---

## What

The direct-manipulation interactions on the tiled layout: **drag a gap** between
tiles to resize the split, and **drag a window's title bar onto another tile** to
swap their positions.

## Acceptance criteria

- [x] The **gap** between two tiles is a draggable divider (sensible hit width);
      dragging it adjusts that split's ratio (via c0065) and all descendants
      reflow live, clamped to the minimum tile size.
- [x] Dragging a window's **title bar onto another tile swaps** the two windows in
      the tree; a drop indicator shows the target.
- [x] The iframe **drag-shield** covers the tiles during gap-drag and swap-drag so
      the sandboxed apps don't swallow the mouse.
- [x] Gap-drag and swap use only engine operations (resize/swap) — no ad-hoc
      geometry; the layout stays consistent.
- [x] Component tests: a simulated gap-drag changes the split ratio; a simulated
      title-bar drop swaps two windows.

## Notes

Beides fasst den Baum nur über die Rechnung aus c0065 an — die Oberfläche legt
keine eigene Geometrie an:

- `core/tiling` bekommt zwei reine Zutaten dazu: `gapBands()` nennt jede Fuge des
  Baums (Pfad, Richtung, Streifen) — was `hitGap` für einen Punkt sucht, für
  alle auf einmal —, und `hitLeaf()` sagt, welches Fenster unter einem Punkt
  liegt. Auf der Fuge selbst liegt keines; darum taucht man beim Tauschen nicht
  aus Versehen in die Nachbarkachel.
- `components/TileGaps` (neu) legt über die Fenster eine Schicht, die **nur an
  den Fugen** Klicks annimmt (`pointer-events` aus, je Griff wieder an). Der
  Griff ist beidseits um 4 px breiter als die Fuge — 20 px, die man nicht suchen
  muss. Gezogen wird über einer Schutzschicht, sonst schluckten die iframes die
  Maus. Die Schicht liegt bei `z-index: 9000`: über den Fenstern (deren z bei 1
  anfängt), unter Dock (10000) und den Überlagerungen (15000+).
- **Die Maus meldet im Programmfenster, der Baum rechnet in der Bühne.** Darum
  misst `DesktopView.measure()` jetzt auch `stageOrigin`, und
  `desktop.stagePoint()` rechnet jeden Mauspunkt an einer Stelle um. Ohne das
  ginge die Rechnung genau dann schief, wenn die Bühne nicht bei 0/0 anfängt.
- `stores/desktop` bekommt die drei Wege, auf denen der Baum sich sonst noch
  ändert: `dragGap(path, point)` (→ `ratioAtPoint` + `setRatio`, doppelt
  begrenzt auf `MIN_TILE`) und `startTileSwap`/`aimTileSwap`/`dropTileSwap`
  (→ `hitLeaf` + `swapLeaves`). Gezielt wird laufend, getauscht erst beim
  Loslassen — die eigene Kachel und die Fuge sind kein Ziel.
- `components/WindowFrame`: Die Titelleiste verschiebt im Kachel-Modus nicht,
  sie **trägt** — das getragene Fenster bleibt an seinem Platz (durchscheinend,
  gestrichelt), und die Zielkachel zeigt, wo es landet. `stopInteraction` bricht
  einen Zug ab, der nicht beim Loslassen endet (das Fenster geht fort).
- Solange getragen wird oder ein Fenster maximiert die Fläche füllt, gibt es
  keine Fuge zu fassen — sonst lägen die Griffe über einer Kachel, die gar nicht
  dort ist.

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 Fuge ziehen + Kacheln tauschen umgesetzt: gapBands/hitLeaf in
  core/tiling, dragGap + Tausch-Zug im Desktop-Store, components/TileGaps (neu),
  Tragen an der Titelleiste im WindowFrame (1255 Tests grün, typecheck + build
  sauber)
- 2026-08-09 status → review (agent)
