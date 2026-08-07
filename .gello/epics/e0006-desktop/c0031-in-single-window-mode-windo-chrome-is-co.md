---
id: c0031
title: In single window mode windo chrome is confusing
status: in-progress
created: 2026-08-07
updated: 2026-08-07
status-changed: 2026-08-07T23:02:32
epic: e0006
---

Just display the app fullscreen and add a button to go back to the desktop

## Notes

Im Einzel-Modus trug das `WindowFrame` weiterhin die volle Fenster-Zierleiste
(Minimieren/Maximieren/Schließen, Ziehen, Größengriff) — Bedienelemente eines
Fenstermanagers, den es in diesem Modus gar nicht gibt.

Lösung:

- **Einzel-Modus ohne Fenster-Chrome**: kein Minimieren, kein Maximieren, kein
  Schließen, kein Ziehen/Größe. Die App füllt die Fläche.
- **`← Desktop`-Knopf** in der schmalen Kopfzeile (neben App-Icon und -Name,
  Versionsknopf bleibt) führt zurück zum Launcher.
- Dafür neu im Desktop-Store: `showingDesktop` + `showDesktop()` und der Getter
  `activeId` (= `focusedId`, aber `null`, solange im Einzel-Modus der Desktop
  gezeigt wird). `focusWindow`/`spawn` heben den Zustand wieder auf.
- Damit ein laufendes Fenster (auch ein Entwurf ohne Kachel) erreichbar bleibt,
  listet das Dock im Einzel-Modus auf dem Desktop **alle** offenen Fenster;
  im Fenster-Modus wie bisher nur die minimierten.
- Die globale Promptleiste hängt am `activeId`: auf dem Desktop entsteht also
  eine neue App (Kontext-Label „Neue App“) statt einer Änderung am verborgenen
  Fenster.

## Acceptance

- [x] Im Einzel-Modus zeigt das Fenster weder Minimieren-, Maximieren- noch
      Schließen-Knopf und keinen Größengriff.
- [x] Ein `← Desktop`-Knopf blendet die App aus und zeigt den Launcher.
- [x] Vom Desktop aus ist die laufende App über Kachel oder Dock wieder
      erreichbar.
- [x] Eine Eingabe in der Promptleiste geht auf dem Desktop an eine neue App.
- [x] Fenster-Modus unverändert.

Belegt durch neue Tests in `desktop.spec.ts` (showDesktop/activeId/Promptleiste),
`WindowFrame.spec.ts` (keine Fensterknöpfe, kein Ziehen, Desktop-Knopf) und
`DesktopView.spec.ts` (Launcher, Dock, Kontext-Label). Ganze Suite: 293 Tests
grün, `vue-tsc --noEmit` fehlerfrei.

## Log

- 2026-08-07 status → ready (app)
- 2026-08-07 status → in-progress (agent)
- 2026-08-07 Einzel-Modus ohne Fenster-Chrome, `← Desktop`-Knopf, Dock als
  App-Umschalter; Promptleiste am neuen `activeId` (agent)
