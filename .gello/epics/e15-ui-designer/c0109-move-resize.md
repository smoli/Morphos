---
id: c0109
title: "Move + resize blocks"
status: done
epic: e15
depends: [c0107]
created: 2026-08-16
commit: 9e6e7dd
updated: 2026-08-27
status-changed: 2026-08-27T22:33:43
usage-tokens: 71628
usage-cost: 8.296765
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

## Review

### 2026-08-17T19:13:56 — pass

Checked: alle fünf Akzeptanzkriterien gegen den Code, den Diff von `9e6e7dd`,
`npm test`, `npm run typecheck`, `npm run build`.

- "Dragged to a new position; `rect.x/y` update": `DesignOverlay.onGrab`/
  `onPointerDown` machen aus dem Druck auf den ausgewählten Kasten einen Zug,
  `finish` meldet `move`, `AppWindow` reicht ihn an `store.moveDesignBlock` →
  `placeBlock` (`src/core/design.ts:400`). Belegt in
  `DesignOverlay.spec.ts` ("schiebt den ausgewählten Kasten an eine neue
  Stelle", "schiebt auch einen geschachtelten Kasten") und `design.spec.ts`
  (`placeBlock` nimmt die Kinder mit).
- "Resize handles change `rect.w/h`, mit Mindestgröße": acht Griffe nur am
  ausgewählten Kasten (`DesignBlock.vue:140`), `resizeRect`
  (`src/core/design.ts:185`) klemmt gegen `MIN_BLOCK_SIZE` (0.01) und lässt den
  Kasten nicht umklappen — `design.spec.ts` "wird nicht kleiner als
  MIN_BLOCK_SIZE und klappt nicht um", `DesignOverlay.spec.ts` "macht einen
  Kasten nicht kleiner als das Kleinste".
- "Persistiert und übersteht das Wiederöffnen": `DesignFlow.spec.ts` "schiebt
  und zieht einen Kasten — und findet ihn so wieder (c0109)" geht über eine
  ECHTE Datei (`core/designstore` im Wegwerf-Ordner), schließt den
  Entwurfs-Modus und öffnet ihn wieder: `{ x: 0.2, y: 0.2, w: 0.5, h: 0.3 }`.
- "Im Fenster geklemmt, nichts Negatives": `moveRect` klemmt gegen `blockBounds`
  (also den ganzen Zweig), `resizeRect` gegen 0 und 1, und der Store-Weg des
  Ziehens geht zusätzlich durch `clampRect`. Geprüft in `design.spec.ts`
  ("bleibt am Rand stehen, statt zu schrumpfen", "lässt nichts ins Negative
  rutschen", "hält auch die Kinder im Fenster") und in `DesignOverlay.spec.ts`
  ("lässt einen Kasten nicht aus dem Fenster hinaus"). Da `clampRect` jede
  gelesene Geometrie in `[0,1]` hält, kann `blockBounds` nicht über das Fenster
  hinausreichen — die Klemmung kehrt sich also nicht um.
- "Ein `.spec.ts` deckt Schieben und Ziehen ab": 42 neue Tests in fünf Dateien
  (`design.spec.ts`, `app.spec.ts`, `DesignBlock.spec.ts`,
  `DesignOverlay.spec.ts`, `DesignFlow.spec.ts`), keine einzige gelöschte oder
  abgeschwächte Zeile in einem Spec (0 Löschungen in `*.spec.ts`), kein `.only`,
  `.skip` oder übrig gebliebener Debug-Code im Diff.
- Checks grün: `npm test` 1916/1916 in 96 Dateien, `vue-tsc --noEmit` sauber,
  `npm run build` sauber. Der Arbeitsbaum unter `src/` ist deckungsgleich mit
  dem Commit.
- Der Diff bleibt im What: nur `core/design`, der Store, die drei Komponenten
  des Entwurfs-Modus und deren Specs. Snap/Führungslinien sind wie angekündigt
  nicht angefasst. Die im Log erwähnte Leerzeile in `TopBar.vue` war eine
  uncommittete Änderung und taucht folgerichtig gar nicht erst im Diff auf.
- Angemerkt, kein Mangel: Ein Druck auf ein NICHT ausgewähltes Kind INNERHALB
  des ausgewählten Elters schiebt den Elter (das Kind meldet sich zwar zuerst,
  fällt in `onGrab` aber durch die Auswahlprüfung, ohne den Elter zu sperren).
  Das deckt sich mit "ein Druck auf den ausgewählten Kasten schiebt ihn", nur
  nicht mit "gemeint ist das Unterste" — c0110 sollte das im Blick behalten.

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
- 2026-08-27 status → done (app)
