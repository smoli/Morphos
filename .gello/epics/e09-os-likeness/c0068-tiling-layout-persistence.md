---
id: c0068
title: "Tiling: per-workspace layout persistence"
status: ready
epic: e09
depends: [c0066]
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T19:13:19
order: 50
---

## What

Remember the tiling **tree + split ratios per workspace** and restore it next
session, alongside which apps are open — mirroring the session-restore pattern
(c0044).

## Acceptance criteria

- [ ] The tiling tree (structure + ratios, keyed by app) is **serialized per
      workspace** in Settings as it changes.
- [ ] On launch into a workspace in Kacheln mode, the tree is **restored** so the
      tiles come back in the same arrangement and proportions.
- [ ] Apps in the saved tree that **no longer exist** on disk are dropped and the
      tree collapses cleanly (no empty tiles / crash).
- [ ] Restoring composes with session restore (c0044): the same open apps, but
      arranged by the saved tiling tree when the mode is Kacheln.
- [ ] Serialize → restore round-trip (incl. a missing-app case) covered by
      **unit tests**.

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
- 2026-08-09 status → ready (app)
