---
id: c0064
title: Add a tiling window manager
status: done
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T21:40:06
epic: e09
depends: [c0065, c0066, c0067, c0068]
usage-tokens: 15798
usage-cost: 2.077882
---

## Breakdown

Umbrella card — split into four dependent sub-cards. Done when all four are:

1. **c0065** — split-tree engine (dwindle), pure + tested *(root)*
2. **c0066** — „Kacheln“ mode + tree-derived rendering *(← c0065)*
3. **c0067** — gap-drag resize + swap-drag *(← c0066)*
4. **c0068** — per-workspace layout persistence *(← c0066)*

The acceptance criteria below are the overall definition of done, split across
those cards.

## What

Add a **tiling** desktop mode — a third mode beside Fenster/Einzeln — modelled on
**Hyprland's „dwindle“** layout: windows never overlap and fill the desktop via a
**binary split tree**. Opening an app **splits the focused tile** in two; the
split orientation follows the tile's aspect ratio (wider → left/right, taller →
top/bottom). **Dragging the gap** between tiles resizes that split (descendants
reflow). **Dragging a window's title bar onto another tile swaps** them. The
layout is **remembered per workspace**.

## Acceptance criteria

- [x] A third mode **„Kacheln“** joins the Fenster/Einzeln switch; switching to it
      tiles the open windows with **no overlap**, filling the desktop area (minus
      gaps); it is **persisted** like `uiMode`.
- [x] Windows are arranged by a **binary split tree (dwindle)**: opening an app
      **splits the focused tile**; split orientation follows the tile's aspect
      ratio (wider → left/right, taller → top/bottom).
- [x] **Dragging the gap** between two tiles adjusts that split's ratio; all
      descendant tiles reflow; a **minimum tile size** is enforced.
- [x] **Closing** a tile collapses its node (the sibling takes the parent's space)
      and reflows; **minimizing** removes it from the layout (to the dock) and
      reflows; restoring re-inserts it.
- [x] **Dragging a window's title bar onto another tile swaps** their positions in
      the tree.
- [x] The tiling **tree + split ratios** are **persisted per workspace** and
      restored next session (alongside which apps are open).
- [x] In tiling mode, geometry is **derived from the tree** — no free move/resize,
      no overlap; **maximize** fullscreens a tile temporarily.
- [x] The **split-tree engine** (split/insert, remove/collapse, resize ratio,
      swap, compute geometry) is **pure** and covered by unit tests, independent of
      the DOM.

## Discussion

Decisions (interviewed 2026-08-09):

- **Model = Hyprland „dwindle“** (dynamic BSP): a binary split tree; a new window
  splits the focused tile; split direction by aspect ratio. Chosen over preset
  layouts and a flat auto-grid.
- **Third desktop mode** („Kacheln“) in the existing mode switch
  (windows / single / **tiling**), persisted like `uiMode`.
- **New window splits the focused tile** (dwindle behaviour).
- **Swap tiles by dragging** a title bar onto another; the **layout persists** per
  workspace (mirrors session restore, c0044).

Open questions for planning:

- **Gaps:** fixed vs configurable (Hyprland has `gaps_in`/`gaps_out`); the gap is
  also the draggable divider's hit area — needs a sensible width.
- **Floating exception:** Hyprland lets some windows float above tiles — a
  per-window „schweben“ escape hatch, or fully managed in v1?
- **Composer (c0056)** and **dock (c0052)** in tiling mode — composer is
  per-window (fine); does the dock overlay tiles or reserve space?
- **System windows** (file explorer, c0047) — do they tile too, or float?
- **Size:** this is large (BSP engine + rendering + gap/swap drag + persist) —
  likely worth **/gello-plan** into sub-cards.

## Notes

- Geometry moves from free `x/y/w/h` (windowed mode) to **computed from the tree**;
  the desktop store gains a per-workspace tiling tree. Reuse the iframe drag-shield
  for gap-drag and swap-drag. Layout persistence mirrors the c0044 pattern.

### Wie es gebaut wurde (c0065–c0068)

- **Rechnung** — `src/core/tiling.ts`: der Teilungsbaum als schlichte Objekte,
  ohne Vue und DOM (`insertLeaf`, `removeLeaf`, `swapLeaves`, `setRatio`,
  `computeRects`, `hitGap`/`gapBands`, `hitLeaf`, `ratioAtPoint`, `mapLeaves`).
- **Aufbewahrung** — `src/core/tilelayout.ts` schreibt den Baum unter App- bzw.
  Ansichts-Schlüssel und holt ihn beim Start zurück.
- **Oberfläche** — `stores/desktop.ts` (Baum je Verzeichnis, `tileRects`,
  Fugen-Zug, Tausch), `components/TileGaps.vue` (die Griffe),
  `components/WindowFrame.vue` (Platz aus dem Baum, Tragen zum Tauschen),
  `views/DesktopView.vue` (Fläche messen, Dock herausrechnen).
- **Wahl der Darstellung** — `core/uimode.ts` + Einstellungen → „Darstellung“
  (c0069), gemerkt wie jede andere Einstellung.

### Die offenen Fragen, so beantwortet

- **Fugen:** fest, `DEFAULT_GAP = 12` — dieselbe Luft zum Rand wie zwischen den
  Kacheln; der Griff greift mit Toleranz auch knapp daneben. Nicht einstellbar.
- **Schweben:** in dieser Fassung schwebt nichts — im Kachel-Modus ist jedes
  Fenster im Verbund. Maximieren füllt vorübergehend die Fläche.
- **Dock:** es hält Platz frei (`reserve-*`), die Kachelfläche endet davor;
  der Composer bleibt Sache des einzelnen Fensters.
- **Fenster der Schale** (Dateien, Einstellungen): kacheln wie App-Fenster.

### Diese Karte selbst

Alle vier Teilkarten sind `done`; hier stand die Abnahme im Ganzen. Dabei fiel
eine Lücke in den Prüfungen auf: geprüft war „überschneidungsfrei und innerhalb
der Fläche“, nicht aber **lückenlos** — ein Baum mit lauter platten Kacheln wäre
durchgegangen. `core/tiling.spec.ts` prüft nun mit `expectFillsArea`, dass
Kacheln und Fugen zusammen genau die Fläche ergeben: beim Aufnehmen und
Abräumen vieler Fenster, am Anschlag der Mindestgröße, nach einem Tausch und auf
einer Fläche, die kaum die Fuge fasst. Die Rechnung hielt bereits stand.

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
