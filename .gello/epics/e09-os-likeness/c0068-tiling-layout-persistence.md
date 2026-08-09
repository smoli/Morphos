---
id: c0068
title: "Tiling: per-workspace layout persistence"
status: done
epic: e09
depends: [c0066]
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T21:26:11
usage-tokens: 55685
usage-cost: 5.624972
---

## What

Remember the tiling **tree + split ratios per workspace** and restore it next
session, alongside which apps are open — mirroring the session-restore pattern
(c0044).

## Acceptance criteria

- [x] The tiling tree (structure + ratios, keyed by app) is **serialized per
      workspace** in Settings as it changes.
- [x] On launch into a workspace in Kacheln mode, the tree is **restored** so the
      tiles come back in the same arrangement and proportions.
- [x] Apps in the saved tree that **no longer exist** on disk are dropped and the
      tree collapses cleanly (no empty tiles / crash).
- [x] Restoring composes with session restore (c0044): the same open apps, but
      arranged by the saved tiling tree when the mode is Kacheln.
- [x] Serialize → restore round-trip (incl. a missing-app case) covered by
      **unit tests**.

## Notes

Die Fenster-Ids (`win-3`) gelten nur für einen Lauf — gemerkt wird der Baum
darum unter demselben Schlüssel wie die Sitzung (`app:<id>` / `sys:<id>`,
`sessionKey` aus `core/session`).

- `core/tiling: mapLeaves` — Blätter umbenennen; wer `null` bekommt oder doppelt
  vorkommt, fällt heraus, die Schwester erbt die Teilung (wie `removeLeaf`).
- `core/tilelayout` (neu) — `serializeTiles` / `restoreTiles` darauf aufgesetzt,
  dazu `sameTree` (nicht zweimal dasselbe schreiben) und `cleanTileTrees` für
  gelesene Einstellungen (beschädigter Ast fällt weg, Verhältnis auf 0…1,
  Tiefe begrenzt).
- `stores/workspace` — `tileLayouts` je Workspace-Pfad plus `saveTileLayout`,
  in `Settings` (`electron/main` tütet beim Lesen und Schreiben ein).
- `stores/desktop` — `persistTiles` nach jedem `syncTiles`/Tausch, nach dem
  Ziehen an der Fuge erst nach kurzer Ruhe; `restoreTileLayout` legt den
  gemerkten Baum in `restoreSession` auf die zurückgeholten Fenster, danach
  zieht `syncTiles` den Verbund gerade (fehlende Fenster kommen hinzu,
  minimierte fallen heraus).

Der Baum wird auch außerhalb des Kachel-Modus gelegt: Wechselt der Anwender
später auf „Kacheln“, steht die Anordnung sofort.

## Log

- 2026-08-09 created from the c0064 tiling-window-manager breakdown
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 umgesetzt: core/tilelayout + mapLeaves, tileLayouts in den
  Einstellungen, Merken/Wiederherstellen im Desktop-Store; 1298 Tests grün,
  vue-tsc sauber
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
