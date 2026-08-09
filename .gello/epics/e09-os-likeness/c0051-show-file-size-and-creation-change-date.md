---
id: c0051
title: Show file size and creation/change date
status: review
ref: c0048
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T07:49:55
---

## What

The explorer listing (c0048) shows only names. Give every entry its **size** and
its **dates** — created and changed — as sortable columns, and show the same
figures in the preview header of the selected file.

## Acceptance criteria

- [x] The listing shows, per entry, **size** (human readable; folders have none)
      and the **changed** and **created** dates; unknown values read as „—“
      rather than „0 B“ / „1.1.1970“.
- [x] The scoped `list` operation carries size and both timestamps, taken
      **without following symlinks** (a link inside the folder describes itself,
      not its target).
- [x] The columns are **sortable**: clicking a column head sorts by it, clicking
      it again reverses; folders stay above files in every order.
- [x] The selected file's **preview header** shows size, changed and created.
- [x] Sorting and formatting rules are pure and unit-tested; that `list` really
      delivers the figures is covered in `core/fsaccess`, the columns in the
      component test.

## Notes

- **Die Angaben kommen mit der Liste**, nicht mit einem `stat` je Eintrag:
  `runFs` misst beim Auflisten jeden Eintrag gleich mit (`measure`), also ein
  Gang statt N Rückfragen über den IPC-Kanal. Gemessen wird mit **`lstat`** —
  ein Symlink beschreibt sich selbst und verrät nichts über ein Ziel, das
  außerhalb des Datenordners liegen mag. Was sich nicht lesen lässt (Eintrag
  inzwischen weg, keine Rechte), bleibt ohne Angaben; der Name genügt der Liste.
- **`size`, `modified`, `created` sind optional** in `FsEntry` — eine Liste ohne
  sie ist weiterhin gültig (der Dateidialog fragt gar nicht danach). In
  `FsStatInfo` ist `created` dagegen fest, wie die übrigen Felder; 0 heißt dort
  „unbekannt“, denn nicht jedes Dateisystem kennt eine Geburtsstunde.
- **Unbekannt ist nicht null:** `formatWhen(0)` und die Größe eines Ordners
  werden zum Strich „—“. Ein „0 B“ am Ordner wäre schlicht falsch (das Maß
  gälte seinem Verzeichniseintrag, nicht seinem Inhalt), ein „1.1.1970“ nur
  irreführend.
- **Sortieren gehört jetzt den Spaltenköpfen** statt dem einen Knopf in der
  Leiste: derselbe Kopf dreht die Richtung, ein anderer fängt so an, wie man ihn
  liest — Namen von A an, Größe und Datum mit dem Größten/Jüngsten oben. Ordner
  bleiben in jeder Ordnung über den Dateien; bei Gleichstand (und bei fehlenden
  Angaben) entscheidet der Name, damit die Liste nicht zufällig springt.
- **Geteilt statt doppelt:** `formatWhen`/`sizeLabel` liegen rein in
  `core/explorer` und dienen Liste, Papierkorb-Ansicht (die ihr eigenes `when`
  losgeworden ist) und dem Vorschau-Kopf. Kopf und Zeilen teilen sich ein
  Raster (`--ex-cols`), damit die Spalten untereinander stehen.
- Das app-seitige API bekommt die Felder mit (Prompt und README) — eine App
  konnte sie ohnehin über `stat` erfragen, jetzt stehen sie schon in der Liste.

## Log

- 2026-08-09 status → in-progress (agent)
- 2026-08-09 Was/Akzeptanzkriterien zur Karte ergänzt (sie kam als reiner Titel)
- 2026-08-09 implemented: `size`/`modified`/`created` in `FsEntry` und `created`
  in `FsStatInfo`, `measure` (lstat) beim Auflisten in `core/fsaccess`,
  `sizeLabel`/`formatWhen`/Sortierung nach Spalte in `core/explorer`, sortierbare
  Spaltenköpfe und Spalten im ExplorerPanel, Zeitpunkte im Vorschau-Kopf,
  Prompt/README nachgezogen — 941 Tests grün (13 neu), Typecheck und Build sauber
  (nur Tests, die Oberfläche selbst nicht im laufenden Electron angesehen)
- 2026-08-09 status → review (agent)
