---
id: c0045
title: Searchable launcher
status: done
epic: e09
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T06:59:30
usage-tokens: 25877
usage-cost: 3.108597
---

## What

A **start-menu / spotlight**-style overlay to find and open apps by typing,
beside the icon grid — keyboard-first, for when there are too many apps to scan
visually.

## Acceptance criteria

- [x] An overlay opens from a launcher control **and** a keyboard shortcut; it has
      a search field focused on open.
- [x] Typing **filters** the workspace's apps (by name) live; results are
      keyboard-navigable (↑/↓) and **Enter opens** the highlighted app (focusing
      its window if already open).
- [x] There is a **„Neue App“** entry / action in the launcher.
- [x] **Esc** closes the overlay; it closes after opening an app.
- [x] Filtering + selection logic (pure) is covered by unit tests; the overlay by
      a component test (type → Enter → openApp called).

## Notes

- `src/core/launcher.ts` hält die reine Logik: `launcherItems` (Apps + „Neue
  App“ als letzter Eintrag), `matchScore`/`filterItems` (akzent- und
  schreibweisenblind; Namensanfang vor Wortanfang vor mittendrin, sonst
  Verzeichnisreihenfolge) und `nextIndex` (↑/↓ laufen im Kreis).
- „Neue App“ ist ein Eintrag der Trefferliste — ertippbar („neue“), unter gleich
  guten Treffern aber hinter den echten Apps.
- `src/components/LauncherOverlay.vue` zeichnet das Startmenü über der Bühne;
  Öffnen läuft über `desktop.openApp`, eine schon laufende App kommt damit nur
  in den Vordergrund (auch aus dem Dock zurück).
- Kürzel: **Strg/⌘ + K** (auf dem Desktop registriert); der Knopf „🔍 Suchen“
  liegt oben rechts neben „Aufräumen“ in der neuen Werkzeugleiste `.desk-tools`.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 status → review (agent)
- 2026-08-09 status → done (app)
