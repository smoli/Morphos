---
id: c0067
title: "Tiling: gap-drag resize + swap-drag"
status: backlog
epic: e09
depends: [c0066]
created: 2026-08-09
updated: 2026-08-09
---

## What

The direct-manipulation interactions on the tiled layout: **drag a gap** between
tiles to resize the split, and **drag a window's title bar onto another tile** to
swap their positions.

## Acceptance criteria

- [ ] The **gap** between two tiles is a draggable divider (sensible hit width);
      dragging it adjusts that split's ratio (via c0065) and all descendants
      reflow live, clamped to the minimum tile size.
- [ ] Dragging a window's **title bar onto another tile swaps** the two windows in
      the tree; a drop indicator shows the target.
- [ ] The iframe **drag-shield** covers the tiles during gap-drag and swap-drag so
      the sandboxed apps don't swallow the mouse.
- [ ] Gap-drag and swap use only engine operations (resize/swap) — no ad-hoc
      geometry; the layout stays consistent.
- [ ] Component tests: a simulated gap-drag changes the split ratio; a simulated
      title-bar drop swaps two windows.

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
