---
id: c0111
title: In the detail for a block show the block hierarchy
status: review
ref: c0110
epic: e15
commit: 4015dd2
created: 2026-08-17
updated: 2026-08-17
status-changed: 2026-08-17T21:19:29
usage-tokens: 25255
usage-cost: 2.978063
---

# In the detail for a block show the block hierarchy

## What

Das Feld zum ausgewählten Kasten (`DesignInspector`, c0108) sagt bisher nur,
wie der Kasten heißt — nicht, wo er im Baum steht. Es soll seinen Weg von der
Wurzel bis zu ihm zeigen und die Kästen, die er unmittelbar enthält; ein Klick
darauf wechselt zu jenem Kasten.

## Acceptance criteria

- [x] Das Feld zeigt den Weg des ausgewählten Kastens von der Wurzel bis zu ihm
      (`Entwurf › Inhalt › Liste`); ein Wurzelkasten steht unmittelbar am
      Entwurf.
- [x] Es zeigt die unmittelbaren Kinder des Kastens; hat er keine, steht dort
      nichts.
- [x] Ein Klick auf einen Vorfahren oder ein Kind wählt jenen Kasten aus — das
      Feld redet fortan von ihm.
- [x] Der Weg kommt aus `core/design` (ein Helfer, keine zweite Rechnung in der
      Ansicht).
- [x] Ein `.spec.ts` deckt Weg, Kinder und das Wechseln ab.

## Notes

**Ein Kasten ist eine Stelle, kein Name.** „Liste“ allein sagt nichts; „Entwurf ›
Inhalt › Liste“ sagt alles, was das Feld über die Gliederung zu sagen hat. Der
Weg steht darum dort, wo bisher bloß der Name stand — der Name ist sein letztes
Glied, nicht eine zweite Zeile daneben.

**Ein Weg, eine Rechnung.** Den Weg rechnet `pathIn` in `core/design`, nicht die
Ansicht: Der Baum wird an genau einer Stelle abgelaufen, und die Kästen kommen
unverändert aus ihm — das Feld nennt damit stets die Namen, die gerade in der
Datei stehen, wie schon der ausgewählte Kasten selbst (`findBlockIn`, c0108).
Einen Kasten, den es nicht gibt, gibt es auch nicht halb: Dann ist der Weg leer.

**Der Weg ist zugleich der Weg dorthin.** Auf der Fläche ist stets das Unterste
gemeint (c0110) — ein Elter, den seine Kinder ganz ausfüllen, ist dort gar nicht
mehr zu treffen; über seinen Namen im Feld schon. Das ist keine Zutat, sondern
das, was das Zeigen erst nützlich macht: Wer sieht, wo er steht, will dorthin.
Ausgewählt wird trotzdem nicht hier — das Feld bittet nur (`select`), und wer
ausgewählt ist, weiß weiter die Fläche.

**Nur eine Ebene hinunter.** Gezeigt werden die unmittelbaren Kinder; tiefer
kommt man, indem man auf eines klickt und dort weiterliest. Ein ganzer Baum im
Feld wäre der Entwurf ein zweites Mal — und der steht schon nebenan, in
Originalgröße.

**Nichts gesagt bleibt still.** Ein Kasten ohne Kinder hat keine leere Liste,
sondern gar keine — wie Rolle und Anweisungen (c0108). Und der Kasten selbst ist
kein Knopf: Bei ihm ist man bereits.

**Umbrechen statt abschneiden.** Das Feld ist 260 Pixel schmal, ein tief
geschachtelter Kasten hat viele Vorfahren. Ein abgeschnittener Weg wäre wertlos
(gerade die vordersten Glieder fielen weg), also darf er umbrechen; abgekürzt
wird höchstens ein einzelner überlanger Name.

Nicht angefasst: `design.ui.json` und der Prompt. Diese Karte zeigt nur, was der
Baum ohnehin sagt — geschrieben wird nichts.

## Review

### 2026-08-17T21:21:04 — pass

Geprüft: Akzeptanzkriterien gegen den Code, Diff von `4015dd2`, volle Suite,
`vue-tsc`, `npm run build`. Ein Lint-Skript gibt es im Repo nicht
(`package.json` kennt nur `test`, `typecheck`, `build`) — nicht gelaufen, weil
nicht vorhanden.

- Weg von der Wurzel: `DesignInspector.vue` rendert `.di-path` als
  `Entwurf › <Vorfahren> › <Name>`; bei leeren `ancestors` steht der Name
  unmittelbar am Entwurf. Belegt in `DesignInspector.spec.ts` („zeigt den Weg
  von der Wurzel bis zum Kasten“, „stellt einen Wurzelkasten unmittelbar an den
  Entwurf“) und am echten Baum in `DesignOverlay.spec.ts`.
- Unmittelbare Kinder: `v-if="block.children.length"` um `.di-kids` — ohne
  Kinder fehlt der Abschnitt ganz, keine leere Liste („schweigt über die
  Kinder, wenn es keine gibt“).
- Wechseln: Vorfahren und Kinder sind Knöpfe, die `select` melden; der Kasten
  selbst ist ein `span` („bietet den Kasten selbst nicht zum Wechseln an“).
  `DesignOverlay.vue:265 onSelect` setzt `selectedId`, das Feld redet danach vom
  neuen Kasten — nachgewiesen in beide Richtungen („wechselt über den Weg zum
  Elter“, „wechselt über die Kinder nach unten“), samt der Falle, dass der Klick
  im Feld die Auswahl nicht wieder aufhebt.
- Eine Rechnung: `pathIn` steht in `src/core/design.ts:315`, das Overlay bildet
  daraus `ancestors` (`pathIn(...).slice(0, -1)`); die Ansicht läuft den Baum
  nicht ab. `design.spec.ts` deckt Weg, Wurzelkasten, fehlenden Kasten (leerer
  Weg, kein halber) und die Durchreiche der Original-Kästen (`toBe`) ab.
- Suite grün: 1984 Tests in 96 Dateien, davon 170 in den drei berührten Specs;
  kein `.only`, `.skip` oder `todo`. `vue-tsc --noEmit` und `npm run build`
  sauber.
- Diff bleibt im What: sechs Dateien, nur `core/design`, `DesignInspector`,
  `DesignOverlay` und deren Specs. `design.ui.json` und der Prompt sind
  unberührt, wie in den Notes gefordert.

## Log

- 2026-08-17 status → in-progress (agent)
- 2026-08-17 `pathIn` in `core/design`; Weg (`.di-path`) und Kinder (`.di-kids`)
  im `DesignInspector`, beide als Wechsel (`select`); `ancestors` und die
  Weiterreichung der Auswahl im `DesignOverlay`. Volle Suite 1984 Tests grün
  (17 neue), `vue-tsc` sauber, `npm run build` sauber.
- 2026-08-17 status → review (agent)
