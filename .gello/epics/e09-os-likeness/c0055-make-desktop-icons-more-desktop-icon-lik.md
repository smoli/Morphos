---
id: c0055
title: Make Desktop icons more desktop icon-like
status: in-progress
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T07:59:09
epic: e09
---

## What

Make the desktop app icons look like **real OS desktop icons**: drop the card
frame (no border/background) — just the icon glyph (emoji or image) with the name
beneath. Minor meta (version count) shows **on hover**. Per-app actions move from
the hover button to a **right-click context menu**.

## Acceptance criteria

- [ ] Desktop icons render **without the card frame** (no border/background) —
      glyph + name label only.
- [ ] Version count (and other minor meta) appear **on hover**, not permanently.
- [ ] **Right-click** an icon opens a context menu with at least **Öffnen**,
      **Icon ändern** (c0037), **Löschen** (with confirmation), and **Im Dock
      behalten / entfernen** (favorites, c0052).
- [ ] The hover 🗑 delete button is **removed** in favor of the context menu.
- [ ] Dragging to arrange (c0043) and opening still work with frameless icons;
      the name label stays **readable over any wallpaper** (c0041) — e.g. a
      shadow/scrim.
- [ ] A **reusable context-menu component** is introduced (also used by the dock
      for pin/unpin).
- [ ] Frameless rendering + context-menu actions covered by component tests.

## Discussion

Decisions (interviewed 2026-08-09, Cluster A):

- **Frameless but meta on hover** — rejected fully-bare (loses the version count
  entirely) and keeping the card.
- **Right-click context menu** for per-icon actions — rejected hover buttons
  (clutter the frameless look). Introduces a **reusable context-menu component**,
  shared with the dock's pin/unpin (c0052) and a natural home for „Icon ändern“
  (c0037, already built) and delete.

Open questions for planning:

- Label readability over image wallpapers (shadow vs scrim vs chip).
- Selection model (single-click select vs open) now that there's no card to click.

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (shell build sequence root)
- 2026-08-09 status → in-progress (agent)
