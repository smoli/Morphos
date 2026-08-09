---
id: c0062
title: Add a setting for autohide
status: done
ref: c0052
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T18:04:42
usage-tokens: 36347
usage-cost: 5.493618
---

# Add a setting for autohide

## What

Das Dock (c0052) kann sich **aus dem Weg legen**: Ist das Ausblenden
eingeschaltet, liegt die Leiste unter dem unteren Rand und kommt erst hervor,
wenn der Zeiger dort ankommt. Ob es das tut, sagt eine Einstellung — je
Arbeitsverzeichnis, wie Durchsichtigkeit (c0060) und Schleier (c0061) auch.

## Acceptance criteria

- [x] In den Einstellungen (Bereich „Darstellung“) lässt sich das **Ausblenden
      des Docks** ein- und ausschalten; die Vorgabe ist **aus** (das Dock steht).
- [x] Ist es an, liegt das Dock **unter dem Rand** und **nimmt keine Klicks an**;
      es kommt hervor, sobald der Zeiger den unteren Rand erreicht, und legt sich
      wieder hin, wenn er die Leiste verlässt.
- [x] Wer mit der **Tastatur** ins Dock findet, sieht es ebenfalls; solange das
      **Kontextmenü** eines Platzes offen steht, bleibt es stehen.
- [x] Die Einstellung wirkt **sofort** und bleibt **je Arbeitsverzeichnis** über
      den Neustart erhalten (wie `dockTransparencies`/`dockBlurs`).
- [x] Beschädigte Einstellungen fallen weg — dann gilt die Vorgabe.
- [x] Rechnung und Eintüten sind reine Logik mit Unit-Tests, Schalter und Leiste
      mit Komponententests.

## Notes

- **Gedeutet als: das Dock legt sich hin.** „autohide“ ist das vom Mac bekannte
  Ausblenden der Leiste; die Karte hängt über `ref:` an c0052 und folgt c0060 /
  c0061, die schon Durchsichtigkeit und Schleier einstellbar gemacht haben.
- **`src/core/dock.ts`** statt `core/transparency`: Das Ausblenden ist kein Glas,
  sondern Verhalten der Leiste — es steht dort, wo schon steht, *was* im Dock
  steht. `cleanAutohide` nimmt nur ein Ja oder Nein an (sonst null),
  `cleanAutohides` tütet die gemerkten Einträge ein, `dockRevealed(autohide,
  near, held)` beantwortet die einzige Frage, die die Ansicht hat.
- **Die Vorgabe wird nicht gemerkt.** Einen „Auf Vorgabe zurücksetzen“-Knopf gibt
  es hier nicht — der Schalter selbst ist der Weg zurück. `setDockAutohide(false)`
  löscht den Eintrag des Verzeichnisses, statt `false` zu schreiben; gelesen wird
  `false` trotzdem klaglos (hand-gepflegte Einstellungen).
- **Hervor kommt es an zwei Stellen:** dem Randstreifen `.dock-zone` (18 px hoch,
  über die volle Breite, nur da, wenn das Ausblenden an ist) und der Leiste
  selbst. Der Streifen überlappt die Leiste um vier Bildpunkte — ohne Überlappung
  läge dazwischen eine Lücke, in der sie sich sofort wieder hinlegte. Dafür nimmt
  der Streifen in diesen 18 px die Klicks; genau das tut ein ausgeblendetes Dock
  am Mac auch.
- Ausgeblendet heißt **nicht abgebaut**: Die Leiste rückt nur mit `transform`
  aus dem Bild (`pointer-events: none`), bleibt aber im DOM — so findet die
  Tastatur hinein (`focusin` holt sie hervor) und nichts wird neu aufgebaut.
- Das **Kontextmenü** eines Platzes hält die Leiste fest (`menu.fromDock`): Sonst
  zöge sie sich weg, sobald der Zeiger ins eigene Menü wandert.
- Der Bereich heißt jetzt schlicht **„Das Dock“** — er trägt nicht mehr nur Glas.
  Die Vorschau zeigt das Ausblenden mit an (die kleine Leiste rutscht halb aus
  dem Bild).
- Geprüft: `npx vitest run` (1108 Tests grün, 22 neue) und `npx vue-tsc
  --noEmit`. Ein Lauf in der echten Electron-App fand nicht statt (Ordnerauswahl
  ist ein nativer Dialog) — belegt ist alles über die Komponententests.

## Log

- 2026-08-09 status → in-progress (agent)
- 2026-08-09 core/dock um `cleanAutohide`/`cleanAutohides`/`dockRevealed`
  erweitert (rot → grün), `dockAutohides` durch Store, Typen und Hauptprozess
  gezogen, Schalter im Bereich „Das Dock“, Leiste legt sich unter den Rand und
  kommt am Randstreifen wieder hervor
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
