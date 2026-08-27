---
id: i0009
title: When speccing a new app make design mode. more accessible
status: done
type: issue
ref: c0112
epic: e15
created: 2026-08-17
updated: 2026-08-27
status-changed: 2026-08-27T22:33:56
commit: 002783e
usage-tokens: 19149
usage-cost: 2.889492
---

In that scenario I want to be able to start the design mode from the „noch kein dialog“ space. Add the option to open mode there![image](../../assets/i0009/image.png)

## What

Seit c0112 darf auch eine App, die es noch nicht gibt, einen Entwurf haben — zu
finden ist er aber nur über das 📐 in der Titelleiste. Wer eine neue App
beschreibt, schaut nicht dorthin, sondern auf den leeren Verlauf („Noch kein
Dialog — beschreibe unten …“): Genau da steht man, solange man nichts gesagt
hat, und genau da gehört der Hinweis hin, dass sich die Gliederung auch zeichnen
lässt. Also bietet der leere Verlauf eines Entwurfs den Entwurfs-Modus mit an.

## Acceptance criteria

- [x] Im leeren Verlauf eines Entwurfs (neue App) steht neben „Noch kein Dialog“
      der Weg zum Entwurfs-Modus; ein Klick öffnet ihn.
- [x] Steht der Entwurf schon offen, ist im Verlauf nichts mehr anzubieten.
- [x] Eine bestehende App bekommt das Angebot nicht — dort steht 📐 in der
      Titelleiste.
- [x] Mit der ersten Nachricht ist der leere Verlauf (und mit ihm das Angebot)
      vorbei.
- [x] `.spec.ts` decken beides ab: `ChatDock` (das Angebot und seine Grenzen) und
      `AppWindow` (der Klick öffnet wirklich die Schicht).

## Notes

**Angeboten wird, wo man steht.** Der `ChatDock` weiß seit c0112 mit `newApp`
schon, dass eine neue App entsteht — dieselbe Fahne trägt jetzt auch das Angebot
im leeren Verlauf. Der Chat öffnet den Entwurf aber nicht selbst: Er meldet
`open-design` nach oben, und das Fenster ruft `store.openDesign()`. Damit bleibt
der Entwurfs-Modus dort, wo er hingehört (`stores/app`), und der Chat kennt
weiterhin nur seinen eigenen Kram.

**Offen ist offen.** `designOpen` reist als Prop mit, damit das Angebot
verschwindet, sobald die Schicht liegt — sonst stünde im Verlauf ein Knopf, der
etwas verspricht, was schon da ist. Geöffnet wird darum mit `openDesign` und
nicht mit `toggleDesign`: Der Knopf ist ein Angebot und kein Umschalter, und ein
Umschalter, der nur im ausgeschalteten Zustand zu sehen ist, wäre keiner.

## Review

### 2026-08-17T22:01:16 — pass

Geprüft: Akzeptanzkriterien gegen den Code, Diff von 002783e, volle Testsuite,
Typecheck. Ein Lint gibt es im Repo nicht (kein `lint`-Skript, keine
eslint-Abhängigkeit oder -Konfiguration) — nichts auszuführen.

- Angebot im leeren Verlauf: `ChatDock.vue:265-286` zeigt „📐 Entwurf zeichnen“
  unter `messages.length === 0` und `newApp && !designOpen`; der Klick emittiert
  `open-design`, `AppWindow.vue:243` hängt es an `openDesign()` →
  `store.openDesign()` (`stores/app.ts:165`, lädt und öffnet die Schicht).
- Offen ist offen: `designOpen` kommt aus `store.designOpen`
  (`AppWindow.vue:240`) und schaltet das Angebot ab — geprüft in ChatDock
  („bietet nichts mehr an, sobald der Entwurf offen steht“) und im AppWindow-Test
  nach dem Klick (`.empty-design` weg, `designOpen` true).
- Bestehende App: `:new-app="store.isDraft"` (`AppWindow.vue:236`) — der
  AppWindow-Test über `mountFrameForApp` sieht „Noch kein Dialog“ ohne Angebot.
- Erste Nachricht: das Angebot steckt im `v-if="messages.length === 0"`-Block,
  abgedeckt von „ist mit dem ersten Wortwechsel vorbei“.
- Tests: 2008 grün in 96 Dateien (`npm test`), darunter die 11 neuen in
  `ChatDock.spec.ts` und `AppWindow.spec.ts`; kein `.only`, kein `.skip`, keine
  abgeschwächte Zusicherung im Diff. `npm run typecheck` (vue-tsc) sauber.
- Diff bleibt im What: nur `ChatDock.vue`/`.spec.ts`, `AppWindow.vue`/`.spec.ts`
  und die Karte; kein Debug-Rest.

## Log

- 2026-08-17 status → in-progress (agent)
- 2026-08-17 Angebot „📐 Entwurf zeichnen“ im leeren Verlauf des `ChatDock`
  (`newApp && !designOpen`), im `AppWindow` an `store.openDesign()` gehängt.
  Volle Suite 2008 Tests grün (11 neue), `vue-tsc` sauber, `npm run build`
  sauber.
- 2026-08-17 status → review (agent)
- 2026-08-27 status → done (app)
