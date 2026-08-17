---
id: c0107
title: "Thin end-to-end slice — draw + name + persist one block"
status: review
epic: e15
depends: [c0105, c0106]
created: 2026-08-16
updated: 2026-08-17
status-changed: 2026-08-17T07:15:50
---

# Thin end-to-end slice — draw + name + persist one block

## What

The first writable slice that closes the whole loop. On the design overlay, the
user drags to draw one flat block, edits its name inline, and the block is
persisted to `design.ui.json` through `core/design`. Because the file now
exists, the next agent run automatically receives the `UI-LAYOUT` section
(c0106) and can follow it: draw → save → agent follows.

## Acceptance criteria

- [x] Dragging on the overlay draws a new block at the dragged `rect`.
- [x] The new block's name is editable inline and defaults to a placeholder.
- [x] Drawing/naming persists the design to `design.ui.json` via `core/design`.
- [x] Reopening design mode shows the persisted block.
- [x] A subsequent generation includes the block in the `UI-LAYOUT` section
      (verified against c0106).
- [x] A `.spec.ts` covers draw → name → persist.

## Notes

Flat/single block only — nesting, resize/move, instructions and roles are the
follow-on cards (c0108–c0110). Keep this deliberately minimal to prove the loop.

**Der Schnitt, den c0105 angekündigt hat.** `core/design` ist jetzt das reine
MODELL (Typen, Zurechtrücken, Baum-Helfer), die Platte liegt in
`core/designstore` (`designPath`, `readDesign`, `writeDesign`). Grund: Der
Renderer verändert den Baum nun selbst und lädt `addBlock`/`updateBlock` als
echte Werte — node:fs darf dabei nicht mitkommen. Nachgeprüft am gebauten
Bündel: In `dist/assets/index-*.js` steht weder `node:fs` noch `readFileSync`
noch `design.ui.json`, nur der Host-Aufruf. Die Tests sind mitgewandert
(`designstore.spec.ts`).

**Der Weg auf die Platte.** Neuer Host-Weg `writeDesign(folder, id, design)`
(preload → `morphos:writeDesign` → `core/designstore`). Er gibt den Baum
zurück, wie er nun in der Datei steht — der Store übernimmt DEN und nicht seine
eigene Rechnung, damit Fenster und Datei nie auseinanderlaufen. Kommt null (oder
wirft der Host), sagt der Store es: `Der Entwurf konnte nicht gespeichert
werden.` Anders als beim Lesen, wo ein fehlender Entwurf der Normalfall ist,
wäre ein nicht gespeicherter Zug stillschweigend verloren.

**Zeichnen.** `.design-stage` ist die Zeichenfläche: pointerdown → Gummiband →
pointerup. Gemessen wird in Anteilen der Fläche (`getBoundingClientRect`), in
jede Ziehrichtung. Ein Zug unter `MIN_BLOCK_SIZE` war ein Klick und hinterlässt
nichts. Die Fläche ist dieselbe, auf der c0105 schon zeichnet — was gezeichnet
und was zu sehen ist, meint damit dasselbe.

**Benennen.** Der aufgezogene Kasten wartet mit ausgewähltem Platzhalter
(`DEFAULT_BLOCK_NAME = 'Neuer Block'`, in `core/design`) auf seinen Namen; erst
mit Eingabetaste oder Verlassen des Feldes entsteht er (`draw`), Escape verwirft
ihn. Ein Klick auf den Namen eines bestehenden Kastens benennt ihn um
(`rename`) — dieselbe Mechanik, dieselbe Komponente. Welcher Kasten gerade
bearbeitet wird, reicht die Fläche als `editingId` durch den Baum, damit immer
nur EIN Feld offen ist. Escape im Feld bleibt im Feld (`.stop`): Ein Druck
räumt eine Sache ab, hier das Feld — nicht gleich den ganzen Entwurfs-Modus.

**Die dünne Scheibe** steht als eigene `DesignFlow.spec.ts`: Fläche → Store →
echte `design.ui.json` in einem Wegwerf-Ordner → Wiederöffnen (auch in einem
zweiten Fenster) → `buildPrompt` mit dem, was `core/generate` von der Platte
liest. Damit ist der Kreis belegt, nicht nur jedes Stück für sich.

Randnotiz: Nach dem Benennen verschwindet der Kasten für den Augenblick des
IPC-Schreibens und kommt als gespeicherter Block zurück. Für die Scheibe reicht
das; wenn c0109 die Kästen anfasst, lohnt ein Blick darauf.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 status → in-progress (agent)
- 2026-08-17 `core/design` in Modell + `core/designstore` getrennt; Zeichnen und
  Benennen in `DesignOverlay`/`DesignBlock`, `addDesignBlock` /
  `renameDesignBlock` / `saveDesign` im Store, `writeDesign` über preload/main.
  Volle Suite 1845 Tests grün, `vue-tsc` sauber, `npm run build` sauber (kein
  node:fs im Renderer-Bündel).
- 2026-08-17 status → review (agent)
