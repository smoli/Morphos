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

- [x] Desktop icons render **without the card frame** (no border/background) —
      glyph + name label only.
- [x] Version count (and other minor meta) appear **on hover**, not permanently.
- [x] **Right-click** an icon opens a context menu with at least **Öffnen**,
      **Icon ändern** (c0037), **Löschen** (with confirmation), and **Im Dock
      behalten / entfernen** (favorites, c0052).
- [x] The hover 🗑 delete button is **removed** in favor of the context menu.
- [x] Dragging to arrange (c0043) and opening still work with frameless icons;
      the name label stays **readable over any wallpaper** (c0041) — e.g. a
      shadow/scrim.
- [x] A **reusable context-menu component** is introduced (also used by the dock
      for pin/unpin).
- [x] Frameless rendering + context-menu actions covered by component tests.

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

## Notes

- **Rahmenlose Kachel** (`views/DesktopView.vue`): `.tile` hat weder Grund noch
  Rahmen — nur die Glyphe (48 px, `AppIcon`) und darunter den Namen. Die
  gezogene Kachel wird blass statt umrandet; die Tastatur bekommt einen
  `:focus-visible`-Ring, damit ohne Rahmen trotzdem sichtbar bleibt, wo man ist.
- **Lesbar über jedem Hintergrund** (c0041): Der Name sitzt auf einem schmalen
  dunklen Schleier (`rgba(10,12,16,.55)`, abgerundet) und trägt einen harten
  Schatten; die Glyphe bekommt einen `drop-shadow`. Gewählt gegen den reinen
  Schatten, weil heller Text über einem hellen Bildhintergrund sonst verschwindet
  (offene Frage aus der Planung: Schatten vs. Schleier vs. Chip → **beides**,
  Schleier + Schatten).
- **Nebensachen erst beim Überfahren**: `hoverId` (Maus *und* Fokus) blendet die
  Versionszahl ein; sie liegt absolut am unteren Rand der Kachel, damit beim
  Erscheinen nichts springt.
- **`components/ContextMenu.vue`** — das wiederverwendbare Kontextmenü: Es
  bekommt Einträge und eine Stelle, meldet `pick` und `close`. Es schließt beim
  Auswählen, mit Escape und bei jedem Klick daneben (Fensterhorcher in der
  Erfassungsphase, damit das Menü zu ist, bevor das Geklickte reagiert).
  `core/menu.ts` (rein, getestet) sagt, wohin es passt: an die Maus, am rechten/
  unteren Rand zur anderen Seite gekippt, notfalls in die Fläche geklemmt.
- **Aktionen der Kachel** stehen nun allein im Menü: Öffnen · Icon ändern
  (c0037) · Im Dock behalten/entfernen · Löschen (mit Rückfrage, abgesetzt).
  Die beiden Hover-Knöpfe (⚙ 🗑) sind fort. Der Dock-Eintrag bietet per
  Rechtsklick dasselbe „Im Dock behalten“ an — dasselbe Bauteil.
- **Lieblinge** (`core/favorites.ts`, rein + getestet; `Settings.favorites`):
  je Workspace-Pfad eine Liste von App-Ids, wie die Kachel-Positionen. Der
  Store führt `favoriteIds` / `isFavorite` / `toggleFavorite`; eine gelöschte
  App wird auch hier vergessen, ein Verzeichnis ohne Lieblinge steht gar nicht
  erst in den Einstellungen. Der Dock-Aufbau daraus ist **c0052**.
- **Auswählen vs. Öffnen** (offene Frage aus der Planung): Ein einfacher Klick
  öffnet weiterhin — kein Auswahlmodell. Keines der Kriterien verlangt es, und
  ein doppelklick-zum-Öffnen bräche das gewohnte Verhalten des Desktops; das
  wäre eine eigene Karte wert.

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (shell build sequence root)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 rahmenlose Icons, Meta beim Überfahren, wiederverwendbares
  `ContextMenu` (+ `core/menu`), Lieblinge je Workspace (`core/favorites`) —
  TDD; 973 Tests grün, `vue-tsc` sauber
