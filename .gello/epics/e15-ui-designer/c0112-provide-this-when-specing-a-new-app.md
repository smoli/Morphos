---
id: c0112
title: Provide this when specing a new app
status: review
ref: c0105
epic: e15
commit: 7dc4784
created: 2026-08-17
updated: 2026-08-17
status-changed: 2026-08-17T21:33:14
usage-tokens: 48558
usage-cost: 9.579511
---

When I create a new app I want to be able to accompany the prompt with an initial UI design

## What

Der UI-Designer (e15) gehört bisher einer bestehenden App: Der 📐-Knopf fehlt im
Fenster eines Entwurfs, und ohne App-Ordner gäbe es auch keine
`design.ui.json`. Gerade beim Anlegen ist der Entwurf aber am meisten wert — wer
eine neue App beschreibt, will die Gliederung mitgeben können, statt sie
hinterher nachzuziehen. Also: Im Fenster eines Entwurfs lässt sich der
Entwurfs-Modus öffnen und zeichnen; der Entwurf lebt so lange im Fenster und
reist mit dem ersten Wunsch in den Ordner der neuen App — der erste Lauf sieht
ihn schon als `UI-LAYOUT`.

## Acceptance criteria

- [x] Im Fenster eines Entwurfs (noch keine App) öffnet 📐 bzw. das Tastenkürzel
      den Entwurfs-Modus; darin lässt sich zeichnen, benennen, beschreiben,
      schieben, schachteln und löschen wie bei einer App.
- [x] Solange es die App nicht gibt, lebt der Entwurf im Fenster — geschrieben
      wird nichts (es gibt noch keinen Ordner).
- [x] Der erste Wunsch nimmt ihn mit: Der Lauf legt ihn als `design.ui.json` in
      den Ordner der neuen App, und schon dieser erste Prompt trägt den
      `UI-LAYOUT`-Abschnitt (c0106).
- [x] Ist die App entstanden, zeigt das Fenster den Entwurf von der Platte und
      arbeitet an ihm weiter wie bei jeder App.
- [x] Ein Lauf, der keine App anlegt (Rückfrage, Fehler), lässt den Entwurf im
      Fenster stehen — der nächste Wunsch nimmt ihn erneut mit.
- [x] Ein leerer Entwurf ändert nichts: keine `design.ui.json`, kein `UI-LAYOUT`.
- [x] `.spec.ts` decken den Weg ab: Fenster-Store, `core/generate` und die ganze
      Scheibe (`DesignFlow.spec.ts`).

## Notes

**Ohne Ordner keine Datei — also wohnt der Entwurf im Fenster.** Eine App, die
es noch nicht gibt, hat keinen Ort, an dem ihr Entwurf läge. Für den
Entwurfs-Modus ändert das nur zweierlei, und beides sitzt im Store: `loadDesign`
fragt ohne Id nicht nach (es gäbe nichts nachzulesen) und lässt vor allem stehen,
was im Fenster steht; `saveDesign` schreibt ohne Id nicht, sondern rückt zurecht
(`normalizeDesign`) und behält. Zeichnen, Benennen, Beschreiben, Schieben,
Schachteln, Löschen laufen alle über `saveDesign` — sie funktionieren damit
unverändert, ohne dass eine davon von der neuen Lage wüsste.

**Zurechtgerückt wird auch ohne Platte.** Sonst zeigte das Fenster einen anderen
Baum, als hinterher in der Datei stünde — dieselbe Regel wie bei einer App, wo
der Hauptprozess zurechtrückt und der Store SEIN Ergebnis übernimmt.

**Mitgebracht wird einmal; geschrieben wird im Lauf.** Der Entwurf reist als
neuntes Argument von `generate` mit (Renderer → preload → main → `PromptContext`)
— aber nur, wenn die App wirklich neu ist und wirklich Kästen hat. `generateApp`
legt ihn als Erstes in den frischen Entwurfsordner (`writeDesign`) und liest
danach wie eh und je von der Platte. Damit bleibt die Regel aus c0106 wörtlich
bestehen: Was im Prompt steht, steht in der Datei. Und es fällt dreierlei
umsonst ab — der Entwurf ist im ersten Commit dabei, er wandert beim Umbenennen
des Ordners mit, und wird aus dem Entwurf nichts, verschwindet er mit
`discardDraft`, während das Fenster ihn behält und der nächste Wunsch ihn erneut
mitnimmt.

**Eine bestehende App schickt nichts mit.** Sie hat ihre `design.ui.json`; was
das Fenster mitschickte, wäre bestenfalls dasselbe und schlimmstenfalls ein
alter Abzug. `generateApp` nimmt einen mitgebrachten Entwurf darum nur für einen
Entwurf an — der Test aus c0106 („nimmt den Entwurf von der Platte, nicht aus
dem mitgegebenen Kontext“) gilt unverändert weiter.

**Ist die App geboren, gilt wieder die Datei.** Genau dann (und nur dann) liest
das Fenster den Entwurf frisch von der Platte — nicht nach jedem Lauf: Der Agent
schreibt die Datei nie, ein Nachlesen wäre sonst eine IPC-Runde für nichts.

**Zwei alte Zusagen sind umgedreht.** `AppWindow.spec` („bietet einem Entwurf
keinen Entwurfs-Modus an“) und `app.spec` („zeichnet nicht in einen Entwurf ohne
App“) hielten den alten Stand fest; sie sind durch ihr Gegenteil ersetzt, nicht
abgeschwächt. Der Knopf 📐 steht nun in jeder Titelleiste.

**Gesagt werden muss, wohin er geht.** Ein Entwurf, der in keiner Datei landet,
braucht ein Wort darüber, was mit ihm geschieht: „geht mit dem ersten Wunsch
mit“ in der Kopfzeile der Schicht, und die leere Fläche lädt zum Aufziehen ein
statt zu melden, dass es für „diese App“ noch keinen Entwurf gibt. Die Fahne
heißt `newApp` wie im `ChatDock` und ausdrücklich NICHT `draft`: In dieser
Komponente ist der „Entwurf“ längst vergeben — an den aufgezogenen, noch
namenlosen Kasten.

## Log

- 2026-08-17 status → in-progress (agent)
- 2026-08-17 Entwurf ohne App im Fenster (`loadDesign`/`saveDesign` in
  `stores/app`), als neuntes Argument von `generate` durch preload/main, in
  `core/generate` vor dem Lauf in den Entwurfsordner geschrieben; 📐 auch im
  Entwurfsfenster, `newApp`-Hinweis im `DesignOverlay`. Volle Suite 1997 Tests
  grün (24 neue), `vue-tsc` sauber, `npm run build` sauber (kein node:fs im
  Renderer-Bündel).
- 2026-08-17 status → review (agent)
