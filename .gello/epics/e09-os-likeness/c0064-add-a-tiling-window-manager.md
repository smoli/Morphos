---
id: c0064
title: Add a tiling window manager
status: in-progress
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T21:26:18
epic: e09
depends: [c0065, c0066, c0067, c0068]
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

- [ ] A third mode **„Kacheln“** joins the Fenster/Einzeln switch; switching to it
      tiles the open windows with **no overlap**, filling the desktop area (minus
      gaps); it is **persisted** like `uiMode`.
- [ ] Windows are arranged by a **binary split tree (dwindle)**: opening an app
      **splits the focused tile**; split orientation follows the tile's aspect
      ratio (wider → left/right, taller → top/bottom).
- [ ] **Dragging the gap** between two tiles adjusts that split's ratio; all
      descendant tiles reflow; a **minimum tile size** is enforced.
- [ ] **Closing** a tile collapses its node (the sibling takes the parent's space)
      and reflows; **minimizing** removes it from the layout (to the dock) and
      reflows; restoring re-inserts it.
- [ ] **Dragging a window's title bar onto another tile swaps** their positions in
      the tree.
- [ ] The tiling **tree + split ratios** are **persisted per workspace** and
      restored next session (alongside which apps are open).
- [ ] In tiling mode, geometry is **derived from the tree** — no free move/resize,
      no overlap; **maximize** fullscreens a tile temporarily.
- [ ] The **split-tree engine** (split/insert, remove/collapse, resize ratio,
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

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
