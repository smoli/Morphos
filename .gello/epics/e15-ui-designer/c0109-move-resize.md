---
id: c0109
title: "Move + resize blocks"
status: review
epic: e15
depends: [c0107]
created: 2026-08-16
commit: 9e6e7dd
updated: 2026-08-17
status-changed: 2026-08-17T19:11:29
usage-tokens: 60511
usage-cost: 7.041907
---

# Move + resize blocks

## What

Make placed blocks adjustable: select a block, drag its body to move it, and
drag edge/corner handles to resize it. Geometry updates persist to
`design.ui.json` through `core/design`.

## Acceptance criteria

- [x] A selected block can be dragged to a new position; `rect.x/y` update.
- [x] Resize handles change `rect.w/h`, with a sensible minimum size.
- [x] Geometry changes persist and survive reopening design mode.
- [x] Geometry stays within the overlay/app bounds (clamped, no negatives).
- [x] A `.spec.ts` covers move and resize updating and persisting geometry.

## Notes

Parallel to c0108 — both build on the c0107 slice. Snap-to-grid is explicitly a
later follow-up, not part of this card.

**Auswählen geht dem Anfassen voraus.** Ein Druck auf den AUSGEWÄHLTEN Kasten
schiebt ihn, jeder andere zeichnet wie bisher einen neuen. Das ist keine
Bequemlichkeit, sondern die Bedingung dafür, dass sich in einem Kasten
überhaupt noch ein zweiter aufziehen lässt (c0110 braucht das) — sonst wäre
jede belegte Fläche für den Stift verloren. Die Griffe hat aus demselben Grund
nur der ausgewählte Kasten: acht Punkte an jedem wären ein Nadelkissen statt
eines Entwurfs.

**Wer misst, ist die Fläche.** Der Kasten MELDET bloß, dass er angefasst wurde
und woran (`grab` mit der Kante oder `null` für den Rumpf); der Zeiger läuft
absichtlich weiter nach oben, und die Fläche macht aus demselben Druck einen
Zug statt eines neuen Kastens. Der erste Melder gewinnt — ein Griff liegt auf
seinem Kasten, ein Kind in seinem Elter, gemeint ist das Unterste. So bleibt
die ganze Messerei an der einen Stelle, die weiß, wie groß sie ist.

**Gerechnet wird in `core/design`, nicht in der Zeichenfläche**: `moveRect`,
`resizeRect` und `blockBounds` sind rein und geprüft, und dieselben Funktionen
zeigen den Zug an (das Gummiband) und führen ihn aus (der Entwurf). Zwei
Rechnungen für dasselbe wären zwei Wahrheiten — die Vorschau lügt dann früher
oder später.

**Am Rand ist Schluss, statt zu schrumpfen.** Die Randnotiz aus c0104 ist damit
entschieden: `moveBlock` beschneidet `w/h` gegen das neue `x/y` und macht einen
Kasten am Rand schmaler — richtig fürs Ziehen an einer Kante, falsch fürs
Schieben. Darum schiebt `placeBlock` (neu) und ZIEHT `moveBlock` (wie gehabt).
Ein geschobener Kasten bleibt am Rand einfach stehen und behält seine Größe.

**Schieben meint den ganzen Zweig.** Die Anteile eines Kindes beziehen sich
aufs Fenster (c0104) — bliebe ein Kind liegen, während sein Elter zieht, sagte
der Baum etwas anderes als das Bild (gezeichnet wird ein Kind IM Elter). Also
wandern die Kinder mit, und im Fenster bleiben muss der ganze Zweig
(`blockBounds`), nicht nur der angefasste Kasten. Beim ZIEHEN an einer Kante
bleiben die Kinder dagegen, wo sie sind: Gemeint ist dieser eine Kasten. Dass
ein Kind dabei aus seinem kleiner gezogenen Elter ragen kann, ist die alte
Freiheit des Modells — ob Kästen einander enthalten müssen, entscheidet c0110.

**Der Kasten wandert erst mit der Antwort von der Platte.** Während des Zugs
zeigt nur das Gummiband, wo er landet. Das hält die Regel von c0107 durch
(maßgeblich ist die Datei) und hat einen angenehmen Nebeneffekt: Scheitert das
Schreiben, springt nichts irgendwohin — der Kasten liegt, wo er lag, und
`store.error` sagt, warum. Der Klick, der auf einen Zug folgt, gilt der Fläche
und darf die Auswahl nicht aufheben; dafür merkt sich die Fläche einen Zug bis
zum nächsten Druck.

Nicht angefasst: Einrasten (Snap) und Führungslinien — die stehen, wie die
Karte sagt, später an.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 status → in-progress (agent)
- 2026-08-17 `moveRect`/`resizeRect`/`blockBounds`/`placeBlock` in `core/design`,
  Griffe und `grab` in `DesignBlock`, Zug-Zustand in `DesignOverlay`,
  `moveDesignBlock`/`resizeDesignBlock` im Store, `@move`/`@resize` im
  `AppWindow`. Volle Suite 1916 Tests grün (42 neue), `vue-tsc` sauber,
  `npm run build` sauber. Nebenbei die uncommittete Leerzeile in `TopBar.vue`
  zurückgenommen, die zwei Reviews angemerkt hatten.
- 2026-08-17 status → review (agent)
