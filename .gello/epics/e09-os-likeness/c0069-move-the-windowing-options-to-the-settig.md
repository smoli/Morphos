---
id: c0069
title: Move the windowing options to the settigns dialog
status: in-progress
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T19:56:18
epic: e09
---

## What

Der Umschalter der Darstellung (Fenster / Einzeln / Kacheln) sitzt in der
Kopfleiste — er gehört zu den Einstellungen. Er zieht in den Bereich
„Darstellung“ des Einstellungsfensters, neben die Dock-Einstellungen.

## Acceptance criteria

- [ ] Die Kopfleiste zeigt **keinen** Darstellungs-Umschalter mehr.
- [ ] Im Einstellungsfenster, Bereich **„Darstellung“**, steht ein Block
      **„Der Desktop“** mit den drei Darstellungen (Name, Symbol, kurze
      Erklärung); die gewählte ist hervorgehoben.
- [ ] Ein Klick schaltet **sofort** um und wird wie bisher gemerkt
      (`uiMode`, siehe c0066).
- [ ] Die drei Darstellungen stehen mit Name/Symbol/Erklärung an **einer**
      Stelle (`core/uimode`) — die Einstellungen bauen den Umschalter daraus.
- [ ] Tests: TopBar hat keinen Umschalter mehr; der Einstellungs-Bereich listet
      alle drei, hebt die aktive hervor und schaltet den Workspace um.

## Log

- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
