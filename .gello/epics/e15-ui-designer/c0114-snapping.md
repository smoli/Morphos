---
id: c0114
title: Snapping
status: in-progress
created: 2026-08-18
updated: 2026-08-18
status-changed: 2026-08-18T07:53:55
epic: e15
---

Add optional snapping, with guide lines etc.

## What

Von Hand gezogene Kästen liegen nie ganz bündig: ein Pixel daneben, eine Kante,
die fast auf der anderen sitzt. Also richten sich Züge aus — beim Zeichnen, beim
Schieben und beim Größerziehen rasten Kanten und Mitten an den Kanten und Mitten
der anderen Kästen ein, dazu an Rand und Mitte des Fensters. Während des Zugs
sagen Hilfslinien, WORAN gerade eingerastet ist. Und weil ein Entwurf auch mal
danebenliegen darf, ist das Ausrichten abschaltbar (Kopfzeile) und mit gedrückter
Alt-Taste für den einen Zug ausgesetzt.

## Acceptance criteria

- [ ] Beim Zeichnen, Schieben und Größerziehen rasten Kanten und Mitten an den
      Kanten und Mitten der anderen Kästen sowie an Rand und Mitte des Fensters
      ein (Reichweite `SNAP_RANGE`); die nächste Linie gewinnt.
- [ ] Während des Zugs zeigen Hilfslinien, woran er hängt — sie verschwinden mit
      dem Zug.
- [ ] Das Ausrichten lässt sich in der Kopfzeile abschalten; mit gedrückter
      Alt-Taste ist es für den laufenden Zug ausgesetzt.
- [ ] Der angefasste Kasten ist samt seinem Zweig kein Ziel für sich selbst.
- [ ] Ein eingerasteter Zug führt nicht aus dem Fenster hinaus und macht keinen
      Kasten kleiner als `MIN_BLOCK_SIZE`.
- [ ] Gespeichert wird genau das, was das Gummiband zeigte (eine Rechnung für
      Vorschau und Ergebnis), und ein Klick bleibt ein Klick — aus ihm entsteht
      auch mit Ausrichten kein Kasten.
- [ ] `.spec.ts` decken das Modell (`core/snap`) und die Fläche ab.

## Log

- 2026-08-18 status → ready (app)
- 2026-08-18 status → in-progress (agent)
