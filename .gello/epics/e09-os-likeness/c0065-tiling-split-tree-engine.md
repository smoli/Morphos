---
id: c0065
title: "Tiling: split-tree engine (dwindle)"
status: backlog
epic: e09
created: 2026-08-09
updated: 2026-08-09
---

## What

The pure, DOM-independent **binary split-tree engine** behind the tiling mode
(Hyprland „dwindle“). Leaves are windows; internal nodes are horizontal/vertical
splits with a ratio. It computes each window's rectangle and supports the
operations the UI drives — with no Vue/DOM knowledge, fully unit-tested. Root of
the c0064 breakdown.

## Acceptance criteria

- [ ] A tree type: leaves carry a window id, internal nodes carry
      **orientation** (row/column) + **ratio**; a pure `computeRects(tree, area,
      gap)` yields each window's `{x,y,w,h}` with **no overlap**, honouring the gap.
- [ ] **Insert/split:** adding a window **splits the focused leaf**; orientation is
      chosen by the split tile's **aspect ratio** (wider → left/right, taller →
      top/bottom).
- [ ] **Remove/collapse:** removing a leaf lets its **sibling take the parent's
      space** (node collapses); the tree stays well-formed.
- [ ] **Resize:** adjusting a split's ratio is clamped to a **minimum tile size**;
      descendants recompute.
- [ ] **Swap:** two leaves can be swapped in place.
- [ ] **Hit-testing:** given a point on a gap, the engine identifies which split
      boundary it belongs to (for the drag-resize UI).
- [ ] All of the above are covered by **unit tests** (split direction by aspect,
      collapse, ratio clamp, swap, rect computation, gap hit-test) — no DOM.

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
