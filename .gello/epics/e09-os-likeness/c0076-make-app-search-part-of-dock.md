---
id: c0076
title: make app search part of dock
status: review
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T21:21:36
epic: e09
---

Remove the permanent button on the desktop

## Notes

- Die Lupe steht jetzt als fester Platz **ganz vorn im Dock** (`.dock-item.search`),
  vor dem ＋ und dem Holen aus Git — mit demselben Tooltip samt Tastenkürzel
  (Strg/⌘ + Leertaste oder K), das unverändert weiter gilt.
- Der Knopf „🔍 Suchen“ auf der Desktop-Fläche ist weg; in den `.desk-tools`
  bleibt nur noch das Aufräumen, sobald es etwas aufzuräumen gibt.
- Tests: `DesktopView.spec.ts` öffnet das Startmenü jetzt über den Dock-Platz;
  neuer Test prüft die Reihenfolge der festen Knöpfe und dass auf der Fläche
  kein Suchen-Knopf mehr steht.

## Log

- 2026-08-12 status → backlog (app)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
