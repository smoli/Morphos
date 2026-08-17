---
id: c0112
title: Provide this when specing a new app
status: in-progress
ref: c0105
epic: e15
created: 2026-08-17
updated: 2026-08-17
status-changed: 2026-08-17T21:21:14
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

- [ ] Im Fenster eines Entwurfs (noch keine App) öffnet 📐 bzw. das Tastenkürzel
      den Entwurfs-Modus; darin lässt sich zeichnen, benennen, beschreiben,
      schieben, schachteln und löschen wie bei einer App.
- [ ] Solange es die App nicht gibt, lebt der Entwurf im Fenster — geschrieben
      wird nichts (es gibt noch keinen Ordner).
- [ ] Der erste Wunsch nimmt ihn mit: Der Lauf legt ihn als `design.ui.json` in
      den Ordner der neuen App, und schon dieser erste Prompt trägt den
      `UI-LAYOUT`-Abschnitt (c0106).
- [ ] Ist die App entstanden, zeigt das Fenster den Entwurf von der Platte und
      arbeitet an ihm weiter wie bei jeder App.
- [ ] Ein Lauf, der keine App anlegt (Rückfrage, Fehler), lässt den Entwurf im
      Fenster stehen — der nächste Wunsch nimmt ihn erneut mit.
- [ ] Ein leerer Entwurf ändert nichts: keine `design.ui.json`, kein `UI-LAYOUT`.
- [ ] `.spec.ts` decken den Weg ab: Fenster-Store, `core/generate` und die ganze
      Scheibe (`DesignFlow.spec.ts`).

## Log

- 2026-08-17 status → in-progress (agent)
