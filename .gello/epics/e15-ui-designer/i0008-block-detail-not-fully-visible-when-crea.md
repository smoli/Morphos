---
id: i0008
title: Block detail not fully visible when creating new app
status: review
type: issue
ref: c0112
epic: e15
created: 2026-08-17
updated: 2026-08-17
status-changed: 2026-08-17T21:50:59
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

## Log

- 2026-08-17 status → in-progress (agent)
- 2026-08-17 Nicht abgeschnitten, sondern zugedeckt: Die Composer-Leiste liegt
  über dem unteren Teil des Fensters. `WindowFrame` misst sie und schreibt
  `--composer-height` an; `DesignInspector` setzt sich mit `bottom: calc(12px +
  var(...))` darüber und begrenzt seine Höhe auf den Rest. 2002 Tests grün
  (5 neue), `vue-tsc` und `npm run build` sauber.
- 2026-08-17 status → review (agent)
