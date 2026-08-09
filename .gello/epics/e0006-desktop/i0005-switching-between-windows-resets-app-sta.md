---
id: i0005
title: Switching between windows resets app state
status: review
type: issue
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T14:25:18
epic: e0006
---

When I switch between two app windows, the apps are reloaded and therefore reset

## Notes

Eine erzeugte App lebt in einem `iframe` (`components/AppCanvas`). Ein iframe,
das im DOM umgehängt oder neu aufgebaut wird, lädt sein Dokument von vorn — die
laufende App fängt also wieder bei null an. Genau das geschah beim
Fensterwechsel, in beiden Modi:

- **Fenster-Modus**: `views/DesktopView` zeichnete die Fenster über
  `desktop.stacked`, also nach `z` sortiert. Jedes Nach-vorn-Holen änderte diese
  Reihenfolge, Vue schob den Knoten des Fensters im DOM an seine neue Stelle —
  und das iframe darin lud neu.
- **Einzel-Modus**: Dort stand nur das aktive Fenster im Baum (`v-if`). Der
  Wechsel zu einer anderen App baute das alte Fenster ab und beim Zurück wieder
  auf.

Behoben: Die Fenster-Ebene zeichnet jetzt schlicht `desktop.windows` — jedes
offene Fenster steht ein Leben lang an derselben Stelle im DOM. Wer nicht dran
ist (minimiert, oder im Einzel-Modus nicht das aktive), wird nur ausgeblendet
(`v-show`, neu: `visible(w)`). Den Stapel macht allein der `z-index`, den
`components/WindowFrame` ohnehin schon setzte.

Damit ist der Getter `stacked` des Desktop-Stores ohne Abnehmer — sein einziger
Zweck war die (nun schädliche) Renderreihenfolge. Er ist entfallen; seine Tests
prüfen jetzt direkt das `z` der Fenster.

Geprüft mit neuen Tests in `DesktopView.spec.ts` (Knotenidentität und
DOM-Reihenfolge über den Fokuswechsel hinweg, in beiden Modi). Die vier Tests,
die im Einzel-Modus das *Abbauen* festhielten, prüfen jetzt die Sichtbarkeit
(neuer Helfer `visibleFrames`). Ganze Suite: 1064 Tests grün, `vue-tsc
--noEmit` fehlerfrei, `npm run build` durch.

## Acceptance

- [x] Ein Fenster nach vorn zu holen verschiebt seinen Knoten nicht im DOM —
      die App im iframe läuft unverändert weiter.
- [x] Der Stapel stimmt trotzdem: Das fokussierte Fenster hat den höchsten
      `z-index`.
- [x] Im Einzel-Modus überlebt eine verlassene App den Wechsel zu einer anderen
      und zurück (dasselbe Fenster, nur ausgeblendet).
- [x] Dasselbe für den Abstecher zum Desktop (`← Desktop`) und zurück.
- [x] Minimieren, Maximieren, Schließen, Fensterwechsler und Sitzung
      unverändert.

## Log

- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 Fenster bleiben an ihrem Platz im DOM und werden nur ausgeblendet;
  der Stapel liegt allein im z-index (Tests rot → grün) (agent)
- 2026-08-09 status → review (agent)
