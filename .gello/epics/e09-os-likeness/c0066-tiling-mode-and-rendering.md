---
id: c0066
title: "Tiling: Kacheln mode + tree-derived rendering"
status: in-progress
epic: e09
depends: [c0065]
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T19:44:06
---

## What

Wire the split-tree engine (c0065) into the desktop as a **third mode „Kacheln“**:
windows tile with no overlap, their geometry **derived from the tree**, and the
usual lifecycle (open splits the focused tile, close/minimize reflow) flows
through the engine.

## Acceptance criteria

- [ ] A third mode **„Kacheln“** joins the Fenster/Einzeln switch and is
      **persisted** like `uiMode`; entering it tiles the currently-open windows.
- [ ] Each tiled window's position/size is **computed from the tree** (c0065) over
      the desktop area minus gaps; **no free move/resize** and **no overlap** in
      this mode.
- [ ] **Opening** an app splits the focused tile; **closing** collapses its node;
      **minimizing** removes it (to the dock) and reflows; **restoring** re-inserts
      it — all via the engine.
- [ ] **Maximize** fullscreens a tile temporarily (and restores back into the
      layout).
- [ ] The desktop store holds the **per-workspace tiling tree** as reactive state;
      windows re-render on any tree change.
- [ ] Component/store tests: switching to Kacheln tiles N windows without overlap;
      open/close/minimize update the layout correctly.

## Notes

- Geometry shifts from free `x/y/w/h` (windowed mode) to tree-derived; the window
  frame reads its rect from the tree rather than its own drag state in this mode.

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
