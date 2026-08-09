---
id: c0069
title: Move the windowing options to the settigns dialog
status: review
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T20:00:50
commit: ac5731c
epic: e09
usage-tokens: 16960
usage-cost: 2.235369
---

## What

Der Umschalter der Darstellung (Fenster / Einzeln / Kacheln) sitzt in der
Kopfleiste — er gehört zu den Einstellungen. Er zieht in den Bereich
„Darstellung“ des Einstellungsfensters, neben die Dock-Einstellungen.

## Acceptance criteria

- [x] Die Kopfleiste zeigt **keinen** Darstellungs-Umschalter mehr.
- [x] Im Einstellungsfenster, Bereich **„Darstellung“**, steht ein Block
      **„Der Desktop“** mit den drei Darstellungen (Name, Symbol, kurze
      Erklärung); die gewählte ist hervorgehoben.
- [x] Ein Klick schaltet **sofort** um und wird wie bisher gemerkt
      (`uiMode`, siehe c0066).
- [x] Die drei Darstellungen stehen mit Name/Symbol/Erklärung an **einer**
      Stelle (`core/uimode`) — die Einstellungen bauen den Umschalter daraus.
- [x] Tests: TopBar hat keinen Umschalter mehr; der Einstellungs-Bereich listet
      alle drei, hebt die aktive hervor und schaltet den Workspace um.

## Notes

- `core/uimode` trägt jetzt neben den Werten auch die **Worte**:
  `UI_MODE_OPTIONS` (Id, Name, Zeichen, ein erklärender Satz), `UI_MODES` fällt
  daraus ab. Die drei Namen standen vorher wörtlich in der Kopfleiste — es gab
  keinen Ort, an dem eine Darstellung sich selbst erklärt.
- `AppearanceSection` bekommt den Block **„Der Desktop“** *über* dem Dock: drei
  Karten statt eines Segment-Umschalters, weil jede jetzt einen Satz mitträgt
  (im schmalen Einstellungsfenster brechen sie um).
- `TopBar` verliert den Umschalter samt seiner Formatierung und dem
  `setMode`-Handler; `workspace.setUiMode` ruft nur noch der Einstellungs-
  Bereich. Rechts in der Kopfleiste bleiben Agenten-Anzeige, ⚙ und
  „Ordner wechseln“.
- README: Der Absatz über die Modi zeigt nicht mehr auf die Kopfleiste und nennt
  „Kacheln“ mit (das fehlte seit c0066).

## Log

- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 Umschalter aus der Kopfleiste in die Einstellungen („Darstellung“ →
  „Der Desktop“) verlegt, Namen/Erklärungen nach core/uimode, README nachgezogen
  (1226 Tests grün, typecheck + lint + build sauber) — ac5731c
- 2026-08-09 status → review (agent)
