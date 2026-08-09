---
id: c0063
title: Add option to put dock at the sides and the top
status: review
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T19:26:40
epic: e09
usage-tokens: 50862
usage-cost: 7.240838
---

# Add option to put dock at the sides and the top

## What

Das Dock (c0052) steht nicht mehr nur unten: Eine Einstellung sagt, an welchem
**Rand** die Leiste steht — unten (wie bisher), links, rechts oder oben. Gemerkt
wird das je Arbeitsverzeichnis, wie Durchsichtigkeit (c0060), Schleier (c0061)
und Ausblenden (c0062) auch.

## Acceptance criteria

- [x] In den Einstellungen (Bereich „Das Dock“) lässt sich der **Rand** wählen:
      Unten, Links, Rechts, Oben; die Vorgabe ist **unten**.
- [x] Die Leiste steht sofort am gewählten Rand — an den Seiten **hochkant**
      (die Glyphen stapeln sich, es bricht in eine zweite Spalte um).
- [x] Was am Icon hängt, dreht sich mit: die **Namensblase** zeigt ins Bild, der
      **Laufpunkt** bleibt am Bildschirmrand, das Icon wächst zum Bild hin.
- [x] Das **Ausblenden** (c0062) arbeitet an jedem Rand: Die Leiste legt sich
      über ihren Rand hinaus, und der Randstreifen, an dem sie hervorkommt,
      liegt an demselben Rand.
- [x] Steht das Dock nicht unten und blendet sich nicht aus, **rückt die Fläche
      ein** — sonst verdeckte die Leiste die ersten Kacheln, die oben links
      anfangen.
- [x] Der Rand wirkt **sofort** und bleibt **je Arbeitsverzeichnis** über den
      Neustart erhalten (wie `dockAutohides`).
- [x] Beschädigte Einstellungen fallen weg — dann gilt die Vorgabe.
- [x] Eintüten ist reine Logik mit Unit-Tests, Auswahl und Leiste mit
      Komponententests.

## Notes

- **Gedeutet als: die vier Ränder, sonst nichts.** Die Karte folgt c0060–c0062;
  „sides and the top“ heißt links, rechts und oben — zusätzlich zum bisherigen
  Unten, das Vorgabe bleibt. Freie Größe oder ein Dock je Bildschirm gehört
  nicht dazu.
- **`src/core/dock.ts`**, wo schon das Ausblenden steht: `DOCK_EDGES` führt die
  vier Ränder samt Aufschrift (der erste ist die Vorgabe), `cleanDockEdge` nimmt
  nur einen davon an (sonst null), `cleanDockEdges` tütet die gemerkten Einträge
  ein. Der Typ `DockEdge` steht bei den übrigen Domänen-Typen in `src/types`,
  weil `Settings` ihn führt.
- **Die Vorgabe wird nicht gemerkt** — wie beim Ausblenden:
  `setDockEdge('bottom')` löscht den Eintrag des Verzeichnisses, statt ihn zu
  schreiben. Einen Zurücksetzen-Knopf braucht es damit nicht, „Unten“ ist der
  Weg zurück.
- **Der Rand ist eine Klasse, kein Rechenwerk.** Die Ansicht schreibt
  `edge-<rand>` an die Leiste und an ihren Randstreifen; alles Weitere
  (Ausrichtung, Umbruch, wohin sie sich ausgeblendet legt, Namensblase,
  Laufpunkt, Trennstrich) steht gebündelt in den `.edge-…`-Regeln. So bleibt die
  Vorlage bis auf die Klasse unverändert, und es gibt keinen zweiten Ort, an dem
  Ränder vorkommen.
- **Platz für die Leiste (`reserve-…`):** Die Kacheln fangen oben links an — ein
  Dock links oder oben verdeckte sofort die ersten. Die Fläche rückt darum an
  diesem Rand um 76 px ein (Leiste + Abstand), solange das Dock dort steht und
  sich nicht ausblendet. Unten bleibt es beim Alten: Dort lag die Leiste seit
  c0052 über der Fläche, und daran ändert diese Karte nichts. Ein Nebeneffekt ist
  gewollt: Bei einem Dock oben rutschen „Suchen“/„Aufräumen“ mit nach unten,
  statt unter der Leiste zu verschwinden.
- **Die Auswahl** ist die Segment-Leiste des Hauses (`.seg`, wie bei Agenten und
  Berechtigungen), keine Radioknöpfe. Die Vorschau im Bereich „Das Dock“ zeigt
  den Rand mit — samt Andeutung des Ausblendens in die richtige Richtung.
- **`styleRule` im Test** liest jetzt auch Regeln mit mehreren Wählern und
  überspringt Kommentare: Die Randregeln stehen zum Teil zusammengefasst, und der
  alte Einzeiler-Ausdruck fand sie nicht.
- Geprüft: `npx vitest run` (1134 Tests grün, 26 neue) und `npx vue-tsc
  --noEmit`. Ein Lauf in der echten Electron-App fand wie bei c0062 nicht statt
  (die Ordnerauswahl ist ein nativer Dialog) — belegt ist alles über die
  Komponententests.

## Log

- 2026-08-09 status → backlog (app)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 core/dock um `DOCK_EDGES`/`cleanDockEdge`/`cleanDockEdges` erweitert
  (rot → grün), `dockEdges` durch Typen, Store und Hauptprozess gezogen,
  Segment-Auswahl im Bereich „Das Dock“, Leiste und Randstreifen an alle vier
  Ränder gebracht, Fläche rückt für ein Dock links/rechts/oben ein
- 2026-08-09 status → review (agent)
