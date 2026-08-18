---
id: c0114
title: Snapping
status: review
created: 2026-08-18
updated: 2026-08-18
status-changed: 2026-08-18T08:11:32
epic: e15
commit: 517372a
usage-tokens: 82078
usage-cost: 10.733614
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

**Die Taste selbst, nicht ihr Abdruck im Zeiger** (nachgereicht). Eine
Modifikatortaste löst kein `pointermove` aus: Wer Alt nach der letzten Bewegung
drückt, bekäme sonst erst bei der nächsten Regung eine Antwort. Darum hört die
Fläche für den laufenden Zug auf `keydown`/`keyup` und führt daraus EINE Antwort
(`aligns`) — die das Gummiband liest und, am Ende des Zugs, auch `onPointerUp`.
Das `altKey` des einzelnen Ereignisses zu lesen war der Fehler: Zwei Quellen für
dieselbe Frage, und gespeichert wurde etwas anderes, als zu sehen war. Außerhalb
eines Zugs bleibt die Taste unbeachtet.

**Nicht dabei** (mögliche Folgekarten): Abstände einrasten (gleiche Lücken
zwischen drei Kästen), ein Raster, und das Merken des Umschalters über das
Schließen der Schicht hinaus.

## Review

### 2026-08-18T08:08:16 — fail

Geprüft: alle Akzeptanzkriterien gegen den Code, der Diff von `66c1e54`,
`npm test` (99 Dateien, 2115 Tests grün) und `npm run typecheck` (`vue-tsc`
sauber). Ein Lint-Skript gibt es im Repo nicht, also keins gelaufen.

- Kriterium „Gespeichert wird genau das, was das Gummiband zeigte (eine
  Rechnung für Vorschau und Ergebnis)" ist nicht erfüllt: Das Band rechnet mit
  `aligns` (aus `free`, gesetzt nur in `onPointerDown`/`onPointerMove`,
  `DesignOverlay.vue:327,339`), das Ende des Zugs dagegen mit
  `event.altKey` des pointerup (`DesignOverlay.vue:354`). Eine Alt-Taste, die
  ohne Zeigerbewegung gedrückt oder losgelassen wird, ändert das Ergebnis, ohne
  das Band zu ändern — beides nachgestellt und beides bestätigt:
  Zug 79,90 → 198,130 ohne Alt, Band `left: 20%`, dann Alt gedrückt und
  losgelassen → gespeichert `x: 0.1975`; derselbe Zug mit gehaltenem Alt, Band
  `left: 19.75%`, Alt vor dem Loslassen gelöst → gespeichert `x: 0.2`. Beide
  Wege gehen im Browser, denn eine Modifikatortaste löst kein `pointermove`
  aus. `onPointerUp` müsste dasselbe `aligns.value` lesen, das auch das Band
  liest; ein Test für „Alt zwischen letzter Bewegung und Loslassen" fehlt.
- Alles übrige verifiziert: `snapLines`/`snapMoved`/`snapSized` rasten Kanten
  UND Mitten an den Kästen (rekursiv) sowie an 0/0.5/1 ein, die nächste Linie
  gewinnt (`shiftTo`/`edgeTo` in `core/snap.ts`); Hilfslinien hängen an `drag`
  und verschwinden mit `from`/`to`; Umschalter `.design-snap` mit
  `aria-pressed`; `snapLines(props.blocks, g?.id)` überspringt den angefassten
  Kasten samt Kindern (das `continue` überspringt auch die Rekursion);
  Fenstergrenzen über `lo`/`hi` aus `bounds` (`snapMoved`) bzw. `[0,1]`
  (`snapSized`), `MIN_BLOCK_SIZE` über die Schranke der gegenüberliegenden
  Kante — verworfen statt zurechtgestutzt; der Klick-Test läuft über den rohen
  `span` (`DesignOverlay.vue:364`).
- Der Diff bleibt im What: `core/snap.ts` neu, `round` in `core/design.ts`
  exportiert, `DesignOverlay.vue` verdrahtet, zwei `.spec.ts`. Kein
  `.only`/`.skip`, kein Debug-Rest, kein abgeschwächter Test.

### 2026-08-18T08:13:36 — pass

Geprüft: der Nachbesserungs-Commit `517372a`, der Befund der ersten Runde,
alle Akzeptanzkriterien, `npm test` (99 Dateien, 2118 Tests grün) und
`npm run typecheck` (`vue-tsc` sauber). Ein Lint-Skript gibt es im Repo nicht,
also keins gelaufen.

- Der Befund der ersten Runde ist behoben: `onPointerUp` liest jetzt
  `aligns.value` (`DesignOverlay.vue:383`), dieselbe Quelle wie das Band, und
  ein `keydown`/`keyup`-Paar auf `window` (`onAlt`, `DesignOverlay.vue:354`)
  hält `free` auch bei stillstehendem Zeiger nach. Beide Wege der ersten Runde
  nachgestellt: Zug ohne Alt, Band `left: 20%`, pointerup mit `altKey` →
  gespeichert `x: 0.2`; Zug mit Alt, Band `left: 19.75%`, pointerup ohne
  `altKey` → gespeichert `x: 0.1975`. Band und Ergebnis sagen jetzt in beiden
  Fällen dasselbe. Auch beim Schieben nachgeprüft (Alt mitten im Zug gedrückt:
  Band `left: 29.75%`, gemeldet `x: 0.2975`).
- Die drei neuen Tests sind echt, nicht bloß grün: `DesignOverlay.spec.ts` gegen
  den alten Stand `66c1e54` laufen lassen (eigener Worktree) — „hört die
  Alt-Taste auch bei stillstehendem Zeiger" und „richtet wieder aus, sobald Alt
  vor dem Loslassen fällt" fallen dort, die übrigen 73 bleiben grün.
- Der Wächter in `onAlt` stimmt: Ohne laufenden Zug (`!from.value`) bleibt die
  Taste unbeachtet, und eine andere Taste bei gehaltenem Alt hebt das Aussetzen
  nicht auf (`free.value === event.altKey` → früher Ausstieg) — beides
  nachgestellt und bestätigt. Die Zuhörer werden in `onUnmounted` wieder
  abgemeldet.
- Die übrigen sechs Kriterien stehen unverändert wie in der ersten Runde
  verifiziert: `core/snap.ts` ist von `517372a` nicht angefasst worden.
- Der Diff bleibt im What: nur `DesignOverlay.vue`, `DesignOverlay.spec.ts` und
  die Karte. Kein `.only`/`.skip`, kein Debug-Rest, keine gelöschte oder
  abgeschwächte Zusicherung (null entfernte Test-Zeilen).

## Log

- 2026-08-18 status → ready (app)
- 2026-08-18 status → in-progress (agent)
- 2026-08-18 Ausrichten im Modell (`core/snap`: `snapLines`, `snapMoved`,
  `snapSized`, `SNAP_RANGE`; `round` aus `core/design` öffentlich), in der
  Schicht verdrahtet (`resolve`, Hilfslinien, Umschalter in der Kopfzeile,
  Alt setzt aus). Volle Suite 2115 Tests grün (29 neue), `vue-tsc` sauber,
  `npm run build` sauber.
- 2026-08-18 status → review (agent)
- 2026-08-18 status → in-progress (agent)
- 2026-08-18 Review-Befund behoben: `onPointerUp` liest dasselbe `aligns` wie das
  Gummiband (statt `event.altKey`), und die Fläche hört für den laufenden Zug auf
  `keydown`/`keyup` — Alt wirkt damit auch bei stillstehendem Zeiger, und Band und
  Ergebnis sagen wieder dasselbe. Drei Tests dazu (Alt nach der letzten Bewegung
  gedrückt, vor dem Loslassen gelöst, außerhalb eines Zugs unbeachtet); beide
  neuen Alt-Tests fallen gegen den alten Stand. Volle Suite 2118 Tests grün,
  `vue-tsc` sauber, `npm run build` sauber.
- 2026-08-18 status → review (agent)
