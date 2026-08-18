---
id: c0114
title: Snapping
status: review
created: 2026-08-18
updated: 2026-08-18
status-changed: 2026-08-18T08:04:58
epic: e15
commit: 66c1e54
usage-tokens: 50675
usage-cost: 5.144971
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

- [x] Beim Zeichnen, Schieben und Größerziehen rasten Kanten und Mitten an den
      Kanten und Mitten der anderen Kästen sowie an Rand und Mitte des Fensters
      ein (Reichweite `SNAP_RANGE`); die nächste Linie gewinnt.
- [x] Während des Zugs zeigen Hilfslinien, woran er hängt — sie verschwinden mit
      dem Zug.
- [x] Das Ausrichten lässt sich in der Kopfzeile abschalten; mit gedrückter
      Alt-Taste ist es für den laufenden Zug ausgesetzt.
- [x] Der angefasste Kasten ist samt seinem Zweig kein Ziel für sich selbst.
- [x] Ein eingerasteter Zug führt nicht aus dem Fenster hinaus und macht keinen
      Kasten kleiner als `MIN_BLOCK_SIZE`.
- [x] Gespeichert wird genau das, was das Gummiband zeigte (eine Rechnung für
      Vorschau und Ergebnis), und ein Klick bleibt ein Klick — aus ihm entsteht
      auch mit Ausrichten kein Kasten.
- [x] `.spec.ts` decken das Modell (`core/snap`) und die Fläche ab.

## Notes

**Ein eigenes Modul, weil es eine eigene Frage ist.** `core/snap` rechnet rein und
in Anteilen wie `core/design`, kennt aber nur Flächen und Linien — keine Bäume,
keine Datei. Zwei Funktionen, weil es zwei Züge sind: `snapMoved` schiebt den
ganzen Kasten um EINEN Betrag je Achse (seine Größe ist nicht Gegenstand des
Zugs), `snapSized` bewegt nur die Kanten, die der Griff bewegt — beim Zeichnen
alle vier, denn ein aufgezogener Kasten hat keine feste Seite.

**Anteile statt Pixel, auch beim Einrasten.** `SNAP_RANGE` ist ein Hundertstel
des Fensters, keine Pixelzahl: Der Entwurf ist seit c0104 anteilig, und eine
Reichweite in Pixeln bedeutete in jeder Fenstergröße etwas anderes. Gerundet wird
mit demselben `round` wie im Modell (darum ist es jetzt öffentlich) — zwei
Rundungen wären zwei Wahrheiten, und die Hilfslinie läge knapp neben der Kante,
die sie meint.

**Die Mitten sind kein Beiwerk.** Ziel ist neben beiden Kanten jedes Kastens auch
seine Mitte, dazu 0, 0.5 und 1 des Fensters: „mittig unter dem Kopf“ ist eine der
häufigsten Absichten überhaupt und von Hand kaum zu treffen.

**Eine Rechnung für Vorschau und Ergebnis.** `resolve` in der Schicht macht aus
Anfang und Ende eines Zugs die Fläche und richtet sie aus; das Gummiband zeigt
sie, und dieselbe Funktion liefert am Ende des Zugs, was gespeichert wird. Sonst
läge der Kasten hinterher woanders, als das Band versprach — derselbe Grund, aus
dem schon die Vorschau des künftigen Elters mit `containerIn` rechnet (c0110).

**Was nicht geht, geschieht nicht.** Eine Linie, die den Zweig aus dem Fenster
führte oder den Kasten unter `MIN_BLOCK_SIZE` drückte, wird verworfen, statt
hinterher zurechtgestutzt zu werden: Eine Hilfslinie soll keine Kante zeigen, an
der der Kasten am Ende gar nicht liegt.

**Ob ein Zug ein Zug war, entscheidet der rohe Zug.** Die Prüfung auf
`MIN_BLOCK_SIZE` beim Zeichnen läuft weiter über die ungerichtete Fläche —
sonst bliese ein Antippen dicht an zwei Linien sich zu einem Kasten auf.

**Der angefasste Kasten ist kein Ziel für sich selbst** — samt seinem Zweig, denn
seine Kinder wandern mit ihm (c0109): Er liefe sonst an seinen eigenen Kindern
entlang, statt sich an den anderen auszurichten.

**Abschalten muss man dürfen.** Ein Entwurf darf danebenliegen: Der Umschalter in
der Kopfzeile gilt für alle Züge, Alt für den einen laufenden (und lässt sich
mitten im Zug drücken und wieder loslassen — ob es bündig wird, sieht man erst
beim Ziehen). Die Wahl lebt so lange wie der Entwurfs-Modus; sie ist kein Teil
der Datei und keine gespeicherte Einstellung.

**Nicht dabei** (mögliche Folgekarten): Abstände einrasten (gleiche Lücken
zwischen drei Kästen), ein Raster, und das Merken des Umschalters über das
Schließen der Schicht hinaus.

## Log

- 2026-08-18 status → ready (app)
- 2026-08-18 status → in-progress (agent)
- 2026-08-18 Ausrichten im Modell (`core/snap`: `snapLines`, `snapMoved`,
  `snapSized`, `SNAP_RANGE`; `round` aus `core/design` öffentlich), in der
  Schicht verdrahtet (`resolve`, Hilfslinien, Umschalter in der Kopfzeile,
  Alt setzt aus). Volle Suite 2115 Tests grün (29 neue), `vue-tsc` sauber,
  `npm run build` sauber.
- 2026-08-18 status → review (agent)
