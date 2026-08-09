---
id: i0006
title: Fixed dock overlaps windows
status: review
type: issue
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T23:05:03
epic: e09
---

If the dock is fixed it should not overlap windows that are fullscreen, or when in tiling mode

## Notes

- **Ursache.** Es gab keine Arbeitsfläche, nur die Bühne. Der vollflächige
  Rahmen lag mit `inset: 0` über der ganzen Bühne (maximiert und im
  Einzel-Modus), und die Kachel-Fläche kam aus der gemessenen **Icon-Fläche** —
  die rückt seit c0063 zwar links/rechts/oben um 76 px ein, unten aber nicht
  (dort lag das Dock seit c0052 bewusst über den Icons). Ein festes Dock unten
  verdeckte darum den unteren Rand jedes Vollbild- und jedes Kachel-Fensters.
- **Behoben** mit `src/core/workarea.ts` (neu, reine Logik): `dockInsets(edge,
  fixed)` sagt, welchen Rand die Leiste für sich behält (76 px, dieselbe Zahl
  wie c0063 — jetzt an einer Stelle), `workArea(size, insets)` schneidet daraus
  die Arbeitsfläche, `insetVars(insets)` schreibt sie als `--work-…` an.
- **Ein Weg für beide Fälle:** Die Bühne (`views/DesktopView`) schreibt die
  Ränder an; `components/WindowFrame` rückt `.window-frame.full` per
  `inset: var(--work-…)` ein (ohne Bühne bleibt es bei null), und die
  Kachel-Fläche rechnet ab jetzt aus der Arbeitsfläche statt aus der Icon-Fläche.
  Dafür misst die Ansicht die Bühne mit — die Icon-Fläche bleibt daneben, was
  sie war.
- **`fixed` heißt: die Leiste steht wirklich im Bild** — sichtbar (im
  Einzel-Modus liegt vor der Vollbild-App keine) und nicht auf Ausblenden
  (c0062). Ausgeblendet gehört ihr kein Rand: Das Fenster füllt alles, die
  Leiste kommt beim Herankommen darüber.
- **Absichtlich nicht angerührt:** frei liegende Fenster (die schiebt der
  Anwender selbst, sie dürfen wie am Mac unter die Leiste rutschen) und die
  Icon-Fläche am unteren Rand (c0052/c0063). Die `reserve-…`-Regeln lesen jetzt
  aber dieselben angeschriebenen Werte, statt die 76 px zu wiederholen.
- Geprüft: `npx vitest run` (1325 Tests grün, 13 neue) und `npx vue-tsc
  --noEmit`. Kein Lauf in der echten Electron-App (wie bei c0062/c0063) —
  belegt ist es über Unit- und Komponententests, samt einer Bühne mit von Hand
  gesetzter Größe, weil jsdom kein Layout rechnet.

## Log

- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 `core/workarea` angelegt (rot → grün), Bühne schreibt `--work-…`
  an, vollflächiger Rahmen und Kachel-Fläche halten sich an die Arbeitsfläche
- 2026-08-09 status → review (agent)
