---
id: i0008
title: Block detail not fully visible when creating new app
status: review
type: issue
ref: c0112
epic: e15
commit: a08d061
created: 2026-08-17
updated: 2026-08-17
status-changed: 2026-08-17T21:50:59
usage-tokens: 43078
usage-cost: 4.925661
---

![image](../../assets/i0008/image.png)

## Notes

**Ursache.** Das Feld zum ausgewählten Kasten (`DesignInspector`) hängt an der
unteren rechten Ecke der Entwurfs-Schicht (`bottom: 12px`). Dieselbe Ecke gehört
aber dem Chat: Die Composer-Leiste liegt als eigene Ebene ÜBER dem unteren Teil
des Fensterkörpers (`WindowFrame`: `.w-composer`, `z-index: 6`, bis zu 60 % der
Fensterhöhe), statt ihn zu verkleinern. Das Feld ist also nicht abgeschnitten,
sondern ZUGEDECKT — und beim Anlegen einer App jedes Mal, denn dort steht die
Leiste immer offen und trägt Verlauf, Rahmenwahl und Senden-Knopf. Sichtbar
blieb, was über ihrer Kante lag: Weg, Rolle — und nichts weiter.

**Behebung.** Die Leiste sagt an, wie hoch sie steht. Der Rahmen misst sie
(ResizeObserver, wie die Bühne in `DesktopView`) und schreibt das Maß als
`--composer-height` an sein Wurzelelement; das Feld setzt sich mit
`bottom: calc(12px + var(--composer-height, 0px))` darüber. Gemessen statt
geraten, weil die Leiste mit dem Verlauf wächst und mit dem Chat ganz
verschwindet — eine feste Zahl wäre mal zu viel, mal zu wenig. Und weil ein
niedriges Fenster auch dann zu wenig Platz lassen kann, ist die Höhe des Feldes
auf den Rest begrenzt (`max-height` mit demselben Maß, `overflow-y: auto`): Es
rollt lieber, als oben wieder aus der Fläche zu wachsen.

**Warum nicht die Schicht selbst kürzen.** Naheliegend wäre, die Zeichenfläche
über der Leiste enden zu lassen. Sie darf es nicht: Die Anteile eines Kastens
beziehen sich auf die Fläche, auf der gezeichnet wird (c0104) — und die soll das
Fenster der App meinen. Eine Fläche, die beim Aufklappen des Chats schrumpft,
verschöbe und verzerrte jeden Kasten. Ausweichen tut darum nur das Feld, das
nichts vom Entwurf ist, sondern von der Bedienung.

**Ein Maß für alle.** `--composer-height` steht am Rahmen und nicht im
Entwurfs-Modus: Jeder, der im Fensterkörper an den unteren Rand will, liest es
dort ab, statt sich die Leiste selbst zu suchen — dasselbe Muster wie
`--work-top` & Co. für die Ränder der Bühne (i0006).

**Nachweis.** jsdom rechnet kein CSS einer SFC aus, die Prüfung ist darum
zweigeteilt: `WindowFrame.spec` misst mit nachgestelltem ResizeObserver, dass
der Rahmen das Maß anschreibt (kein Chat → `0px`, Chat → seine Höhe, wachsender
Chat → nachgerückt); `DesignInspector.spec` schlägt die Regel im Quelltext nach
und hält fest, dass das Feld sich um genau dieses Maß hebt und begrenzt
(dasselbe Vorgehen wie bei den Dock-Rändern in `DesktopView.spec`).

## Abnahme

- [x] Beim Anlegen einer App ist das Feld zum ausgewählten Kasten ganz zu sehen
      — Weg, Enthält, Rolle, Anweisungen und „Kasten löschen“ stehen über der
      Chat-Leiste statt hinter ihr.
- [x] Wächst die Leiste (Verlauf, Anhänge) oder klappt der Chat zu, rückt das
      Feld mit; ohne Leiste sitzt es wie zuvor 12px über dem unteren Rand.
- [x] Bleibt zu wenig Platz, rollt das Feld in sich, statt oben abgeschnitten zu
      werden.
- [x] Der Entwurf selbst rührt sich nicht: Die Zeichenfläche bleibt das ganze
      Fenster, die Anteile der Kästen bleiben, wie sie sind.
- [x] Gesamter Testlauf grün (2002 Tests, 5 neue), `vue-tsc` sauber,
      `npm run build` sauber.

## Review

### 2026-08-17T21:55:29 — pass

Geprüft: Abnahmekriterien gegen den Code, der Diff von `a08d061`, `npm test`,
`npm run build` (enthält `vue-tsc --noEmit`). Ein Lint gibt es im Projekt nicht
(kein `lint`-Skript, keine ESLint-Konfiguration) — nicht geprüft, weil nicht
vorhanden.

- Kriterium 1 erfüllt: `WindowFrame.vue` misst die `.w-composer` (Template-Ref +
  ResizeObserver) und schreibt `--composer-height` über `frameStyle` an die
  Wurzel — auch im `full`-Zweig. `DesignInspector.vue:195` hebt sich mit
  `bottom: calc(12px + var(--composer-height, 0px))` darüber. Die Vererbung
  trägt: `.design-inspector` liegt in `.design-stage` → `.design-overlay`
  (`inset: 0`) → `.w-body` → `.window-frame`, und `.w-body` endet wie
  `.w-composer` (`position: absolute; bottom: 0`) am unteren Rand des Rahmens —
  das Maß entspricht also genau der Überdeckung.
- Kriterium 2 erfüllt: gemessen statt geraten, der ResizeObserver hängt am
  Element, der `watch` am Elementwechsel (Chat zu → Ref null → 0px). Belegt in
  `WindowFrame.spec.ts:222–250` (kein Chat → `0px`, Chat → `180px`, wachsende
  Leiste → `320px`, mit nachgestelltem ResizeObserver, weil jsdom keinen hat).
- Kriterium 3 erfüllt: `max-height: calc(100% - var(--composer-height, 0px) -
  24px)` plus `overflow-y: auto`; `100%` ist die Höhe von `.design-stage`, die
  Rechnung lässt oben genau 12px stehen. Belegt in
  `DesignInspector.spec.ts:258–262` — Quelltext-Nachschlag wie in
  `DesktopView.spec.ts:166ff` für die Dock-Ränder, dieselbe Hausregel.
- Kriterium 4 erfüllt: Der Diff rührt weder `.design-stage` noch die Anteile an
  — nur `DesignInspector.vue` (CSS des Feldes) und `WindowFrame.vue` (Ref, Maß,
  `frameStyle`). Kein fremder Umfang, kein Debug-Rest, kein `.only`, kein
  übersprungener oder abgeschwächter Test; der globale ResizeObserver-Stub ist
  auf `WindowFrame.spec` beschränkt und ersetzt nichts, was jsdom vorher hatte.
- Kriterium 5 nachvollzogen: `npm test` → 2002 Tests in 96 Dateien grün (die 5
  neuen darin), `npm run build` sauber inklusive `vue-tsc --noEmit`.

Anmerkung ohne Folgen für den Befund: In einem Fenster nahe `MIN_H` (160px,
`stores/desktop.ts:76`) mit voll aufgezogener Leiste (`max-height: 60%`) wird
die `max-height` des Feldes rechnerisch null — dann ist es nicht abgeschnitten,
sondern gar nicht zu sehen. Dort ist auch tatsächlich kein Platz mehr; falls es
je stören sollte, wäre eine Untergrenze (`max(…, 120px)`) der Ort dafür.

## Log

- 2026-08-17 status → in-progress (agent)
- 2026-08-17 Nicht abgeschnitten, sondern zugedeckt: Die Composer-Leiste liegt
  über dem unteren Teil des Fensters. `WindowFrame` misst sie und schreibt
  `--composer-height` an; `DesignInspector` setzt sich mit `bottom: calc(12px +
  var(...))` darüber und begrenzt seine Höhe auf den Rest. 2002 Tests grün
  (5 neue), `vue-tsc` und `npm run build` sauber.
- 2026-08-17 status → review (agent)
