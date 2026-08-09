---
id: c0071
title: Distinction for active window
status: done
ref: c0064
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T21:40:05
commit: 2cd8727
usage-tokens: 11663
usage-cost: 1.880453
---

Seems, active window has some significance for how the tiling behaves. So we should visually mark the active window.

Have this in general not only for tiling mode

## Notes

- Der Rahmen (`components/WindowFrame`) fragt selbst, ob er das aktive Fenster
  trägt — `stores/desktop → activeId`, dieselbe Stelle, die auch über die
  Kachelteilung und das Ziel der Fenster-Kürzel entscheidet. Kein neuer Zustand,
  keine Prop-Kette durch die Aufsätze.
- Gilt in **jedem** Modus: frei, gekachelt und maximiert. Nur vollflächig
  (Einzel-Modus) bleibt es beim rahmenlosen Bild — dort ist ohnehin genau ein
  Fenster zu sehen.
- Wie es aussieht: das aktive Fenster mit farbigem Rand und tieferem Schatten,
  die anderen treten zurück — flacherer Schatten, ruhige Titelleiste, gedämpfte
  Schrift, blasseres Icon und blassere Knöpfe (auch die, die ein Aufsatz
  beisteuert).
- Liegt im Einzel-Modus der Desktop davor, trägt kein Fenster die Marke
  (`activeId` ist dann null); ein minimiertes Fenster ebenso wenig.

## Log

- 2026-08-09 status → in-progress (agent)
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
