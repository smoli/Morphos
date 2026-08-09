---
id: c0070
title: make ctrl+space shortcut top open app search
status: review
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T21:34:21
epic: e09
---

# make ctrl+space shortcut top open app search

Strg/⌘ + Leertaste öffnet das Startmenü (die App-Suche) — wie die Suche eines
Betriebssystems.

## Notes

- `core/shortcuts` kennt jetzt eine optionale **Zweittaste** (`also`): ein
  Kürzel darf über zwei Tasten erreichbar sein, wenn die erste dem
  Betriebssystem gehören kann.
- Das Startmenü führt darum Leertaste **und** K: Unter macOS greift sich
  Spotlight ⌘ + Leertaste, dort bleibt Strg/⌘ + K der verlässliche Weg. Der
  Spickzettel in den Einstellungen schreibt „Strg/⌘ + Leertaste oder K“ und
  nennt den Grund im Fußtext.
- Leertaste ohne Strg/⌘ (und alles mit Alt oder ⇧) bleibt unangetastet.

## Log

- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 status → review (agent)
