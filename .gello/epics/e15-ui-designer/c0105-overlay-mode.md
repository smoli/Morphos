---
id: c0105
title: "Overlay design mode — toggle + read-only render"
status: backlog
epic: e15
depends: [c0104]
created: 2026-08-16
updated: 2026-08-16
---

# Overlay design mode — toggle + read-only render

## What

A translucent design overlay drawn over the active app window, toggled from the
window titlebar (and a keyboard shortcut). When on, it loads the design via
`core/design` and renders each block as a labelled box positioned by its
`rect`, with nested blocks drawn inside their parents. Render and open/close
only — no editing yet.

## Acceptance criteria

- [ ] A titlebar control (and shortcut) toggles design mode for the active app
      window; Escape closes it.
- [ ] While on, a translucent layer covers the running app without breaking the
      app underneath.
- [ ] Existing blocks from `design.ui.json` render as boxes at their `rect`,
      each showing its name; nested blocks render inside their parent.
- [ ] An empty/absent design shows an empty overlay (no crash).
- [ ] A `.spec.ts` covers toggling and rendering a sample design tree.

## Notes

Mirror the existing panel/overlay patterns (`ExplorerPanel`, `DocsPanel`,
`AppWindow`). Keep the layer purely presentational here — editing lands in
c0107 onward.

## Log

- 2026-08-16 created from the e15 epic breakdown.
