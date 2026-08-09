---
id: c0065
title: "Tiling: split-tree engine (dwindle)"
status: done
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T19:39:27
usage-tokens: 26275
usage-cost: 1.508654
---

## What

The pure, DOM-independent **binary split-tree engine** behind the tiling mode
(Hyprland „dwindle“). Leaves are windows; internal nodes are horizontal/vertical
splits with a ratio. It computes each window's rectangle and supports the
operations the UI drives — with no Vue/DOM knowledge, fully unit-tested. Root of
the c0064 breakdown.

## Acceptance criteria

- [x] A tree type: leaves carry a window id, internal nodes carry
      **orientation** (row/column) + **ratio**; a pure `computeRects(tree, area,
      gap)` yields each window's `{x,y,w,h}` with **no overlap**, honouring the gap.
- [x] **Insert/split:** adding a window **splits the focused leaf**; orientation is
      chosen by the split tile's **aspect ratio** (wider → left/right, taller →
      top/bottom).
- [x] **Remove/collapse:** removing a leaf lets its **sibling take the parent's
      space** (node collapses); the tree stays well-formed.
- [x] **Resize:** adjusting a split's ratio is clamped to a **minimum tile size**;
      descendants recompute.
- [x] **Swap:** two leaves can be swapped in place.
- [x] **Hit-testing:** given a point on a gap, the engine identifies which split
      boundary it belongs to (for the drag-resize UI).
- [x] All of the above are covered by **unit tests** (split direction by aspect,
      collapse, ratio clamp, swap, rect computation, gap hit-test) — no DOM.

## Notes

`src/core/tiling.ts` + `src/core/tiling.spec.ts` (37 Tests, kein DOM). Der Baum
ist ein schlichtes Objekt (`leaf` / `split` mit `orientation`, `ratio`) — also
auch speicherbar für c0068. Alle Operationen sind rein und geben bei einer
Nulländerung denselben Baum zurück.

- `computeRects(tree, area, gap)` — die Fuge zehrt von der Fläche, die beiden
  Hälften füllen den Rest genau aus; darum überschneidet sich nichts und es
  bleibt kein Rest.
- `insertLeaf(tree, focusId, id, area, gap)` — teilt die Brennpunkt-Kachel quer
  zu ihrer längeren Seite; ohne bekannten Brennpunkt die Kachel ganz rechts
  unten. Eine schon vorhandene id wird nicht doppelt aufgenommen.
- `removeLeaf` / `swapLeaves` / `leafIds` / `hasLeaf`.
- Knoten werden über einen Pfad (`['b','a']`, Wurzel = `[]`) angesprochen:
  `nodeAt`, `nodeArea`, `setRatio(…, min = MIN_TILE)`, `clampRatio`.
- Fürs Ziehen an der Fuge: `hitGap(tree, point, area, gap, tolerance)` liefert
  Pfad, Richtung und den Streifen; `ratioAtPoint` macht daraus das (schon
  begrenzte) Verhältnis. `DEFAULT_GAP = 12`, `MIN_TILE = 96` sind Vorschläge
  für c0066/c0067 — die Fugenbreite ist damit noch nicht entschieden.

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
