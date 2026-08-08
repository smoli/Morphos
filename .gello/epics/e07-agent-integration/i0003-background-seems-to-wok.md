---
id: i0003
title: Background agents loose UI progress
status: review
type: issue
ref: c0030
epic: e07
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T07:47:21
---

but when leaving the app to desktop and going back in again, the chat progress, i.e. the last prompt and what the agent is doing is gone and the agent activity is not displayed in the spinner text

## Acceptance criteria

- [x] Im Einzel-Modus über „← Desktop“ und zurück in eine arbeitende App:
      Der Dialog zeigt weiterhin den zuletzt abgeschickten Wunsch, die
      Warteanzeige weiterhin den laufenden Schritt und die Laufzeit.
- [x] Auch der Wechsel zu einer anderen App und zurück lässt den Lauf
      unangetastet.
- [x] Die App wird beim erneuten Anzeigen **nicht** von der Platte nachgeladen
      (das ersetzte den laufenden Stand durch den zuletzt committeten).
- [x] Ein wirklich geschlossenes Fenster gibt seinen Store weiterhin frei.
- [x] Abgedeckt durch Tests in `WindowFrame.spec.ts` und `DesktopView.spec.ts`.

## Notes

Ursache: Im Einzel-Modus rendert `DesktopView` nur das **aktive** Fenster
(`v-if`). „← Desktop“ setzt `showingDesktop`, damit wird `activeId` null und der
`WindowFrame` **verschwindet** — sein `onBeforeUnmount` warf mit `$dispose()`
den Instanz-Store weg. Beim Zurückkehren baute `onMounted` ihn über
`store.open()` neu aus der Platte auf: Der laufende Agent schreibt aber in den
alten Store, und der frische kennt weder den eben abgeschickten Wunsch (noch
nicht committet) noch `activity`, `runStartedAt` oder `busy`. Darum blieb die
Warteanzeige stumm und der Verlauf leer.

Behoben in `WindowFrame.vue` — der Zustand gehört dem **Fenster**, nicht seiner
gerade sichtbaren Ansicht:

- `onMounted` lädt nicht mehr blind: Hält der Store diese App bereits
  (`store.id === win.appId`), wird nur die Ansicht wieder eingeblendet — dann
  bleibt alles, wie es ist.
- `onBeforeUnmount` gibt den Store nur frei, wenn das Fenster wirklich
  geschlossen ist (`desktop.find(instanceId)` leer). Das Ausblenden beim Wechsel
  zum Desktop oder zu einer anderen App ist kein Schließen.

Am Rande geprüft: Ein Lauf, der ohne sein (geschlossenes) Fenster weiterarbeitet
und dessen App danach in einem **neuen** Fenster geöffnet wird, zeigt weiterhin
nur die allgemeine Warteanzeige (`runningElsewhere`) ohne Schritt und Laufzeit —
der Fortschritt liegt im Instanz-Store, nicht im Auftrag. Das ist ein anderer
Fall als der gemeldete und bleibt, wie es war.

## Log

- 2026-08-08 status → backlog (app)
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 status → review (agent)
