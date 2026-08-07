---
id: c0028
title: Switch Claude-cli integration to streaming
status: done
created: 2026-08-06
updated: 2026-08-07
status-changed: 2026-08-07T23:08:06
usage-tokens: 45587
usage-cost: 5.692752
---

Moving to the streaming version gives several advantages

* Having the chat expanded the user can better follow what the agent does.
* When the agent takes it's time it can prevent timeouts.

## Notes

Die CLI läuft jetzt mit `--output-format stream-json --verbose
--include-partial-messages` statt `--output-format json`.

- `src/core/agent.ts`: `createAgentStream()` liest den JSONL-Strom (Datenblöcke
  rein, Ereignisse raus — Zeilengrenzen dürfen mitten hindurch gehen).
  Werkzeugschritte kommen aus den assistant-Nachrichten, der Fortschritt an den
  Dateien aus den Marken im strömenden Antworttext (`===MORPHOS:FILE …===`,
  `DELETE`, `SAY`). `agentEventLabel()` liefert den Anzeigetext.
- Aus dem Gesamt-Zeitbudget wird ein **Ruhe**-Zeitbudget
  (`AGENT_IDLE_TIMEOUT_MS`): Jedes Lebenszeichen der CLI setzt es zurück, ein
  langer Lauf kann also nicht mehr in die Zeitüberschreitung laufen, solange
  der Agent arbeitet.
- Der Hauptprozess schickt jedes Ereignis mit einer Lauf-Id an genau das
  Fenster zurück, das den Lauf gestartet hat (`morphos:agentEvent`); der
  App-Store sammelt sie in `activity` und meldet sich danach wieder ab.
- Der ChatDock klappt bei laufendem Lauf auf und zeigt die Schritte mit.

Gegen die echte Claude CLI (2.1.219) einmal live geprüft: der Strom ergibt
`start → think → write src/index.html → done`, das Endergebnis ist unverändert
der Roh-Antworttext.

## Log

- 2026-08-07 status → ready (app)
- 2026-08-07 status → in-progress (agent)
- 2026-08-07 status → review (agent)
- 2026-08-07 status → done (app)
