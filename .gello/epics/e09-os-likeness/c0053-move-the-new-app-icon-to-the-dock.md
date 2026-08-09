---
id: c0053
title: move the new App Icon to the dock
status: discuss
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T07:49:20
epic: e09
---

## What

Move the **＋ New-App** control out of the launcher grid and into the **dock**,
pinned at the leading edge and **always present** — even with zero apps or none
running. Clicking it starts a new app. (The dock mechanics live in c0052; this is
the specific relocation.)

## Acceptance criteria

- [ ] ＋ New-App is a **permanent dock item** at the leading edge, always shown
      (zero apps / zero running included).
- [ ] The launcher grid **no longer** contains a ＋ New-App tile.
- [ ] Clicking it **starts a new app** (opening the composer per Cluster B /
      c0056).

## Discussion

Decision (2026-08-09, Cluster A): the ＋ is a pinned dock item, always there. This
overlaps heavily with **c0052** (dock design) — kept as its own thin card for the
grid→dock move; consider merging into c0052 at planning time.

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → discuss (app)
