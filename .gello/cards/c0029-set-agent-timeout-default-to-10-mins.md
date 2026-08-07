---
id: c0029
title: set agent timeout default to 10 mins
status: done
created: 2026-08-06
updated: 2026-08-07
status-changed: 2026-08-07T22:46:31
commit: 0d0ff43
usage-tokens: 7218
usage-cost: 0.920901
---

# set agent timeout default to 10 mins

Ein Agentenlauf (Claude CLI) durfte nur 5 Minuten dauern; längere
Generierungen liefen in die Zeitüberschreitung. Standard ist nun 10 Minuten.

## Notes

- Zeitbudget und Abbruchmeldung liegen jetzt in `src/core/agent.ts`
  (`AGENT_TIMEOUT_MS`, `agentTimeoutMessage()`) — testbar, und die
  Minutenangabe der Meldung folgt dem Wert statt fest verdrahtet zu sein.
- `electron/main.ts` nutzt beide statt des lokalen `CLAUDE_TIMEOUT_MS`.
- Es gibt (noch) keine Einstellung dafür — "default" heißt hier der im Code
  gesetzte Standardwert.
- Abnahme: `src/core/agent.spec.ts` grün, `npm test` (257 Tests) und
  `npm run typecheck` grün.

## Log

- 2026-08-07 status → ready (app)
- 2026-08-07 status → in-progress (agent)
- 2026-08-07 status → review (agent)
- 2026-08-07 status → done (app)
