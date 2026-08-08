---
id: c0030
title: Agent needs a busy state and a queue
status: done
created: 2026-08-06
updated: 2026-08-08
status-changed: 2026-08-08T23:18:41
epic: e07
usage-tokens: 87203
usage-cost: 14.214753
---

## What

Limit how many Claude agents run at once and queue the rest, so juggling
several apps doesn't spawn many parallel `claude` processes and burn tokens.

Agents run in the **background**: the user can switch apps, queue more prompts,
and even close an app window while its work is still running. The desktop shows
what's happening — a **working indicator** on each busy app's icon and a **global
count** of running/queued agents in the title bar — and lets the user **cancel**
running or queued work.

The key architectural consequence: because a job must outlive its window, the
queue can't live in the per-window app store. A central **agent-queue** owns each
generation (keyed by app, not window); when a job finishes it updates the live
window if still open, otherwise saves + commits the result to the app on disk.

## Acceptance criteria

- [x] Max concurrent agents is configurable in ⚙ Settings (default **2**,
      global across the app); submitting beyond the limit **queues** the request
      instead of spawning another `claude` process.
- [x] The queue is **FIFO**: when a running agent finishes and a slot frees, the
      next queued job starts automatically.
- [x] Submitting a second prompt to an app that is already working **enqueues**
      it; it runs after the first completes, against the app's updated state. An
      app never has two agents running for it at once.
- [x] Closing or leaving an app window while its agent runs does **not** cancel
      it; on completion the result is applied to the open window if present,
      otherwise **saved and committed** to the app on disk.
- [x] A draft whose window is closed mid–first-generation is **finalized** into a
      real app on disk (id/name/icon derived, saved, committed).
- [x] The user can **cancel a queued** request (removed, never runs) and a
      **running** agent (its `claude` subprocess is terminated); a cancelled run
      leaves the app unchanged and clears its busy state.
- [x] The title bar shows a live **count** of running + queued agents; clicking
      it opens a **popover** listing each job by app name with a cancel control.
- [x] Apps with a running or queued agent show a **working indicator** on their
      launcher tile, dock item, and window title bar.
- [x] The queue logic (enqueue, concurrency cap, FIFO dequeue, cancel, per-app
      serialization) is covered by **unit tests** independent of Electron.

## Discussion

Decisions (interviewed 2026-08-07):

- **Concurrency:** configurable, default 2. Global (one Claude login), not
  per-workspace. Rejected: fixed serial (too slow across apps) and fixed
  hard-coded limit (no flexibility for cost/perf trade-off).
- **Background survival:** closing a window keeps the agent running. This forces
  the queue to be a central, session-scoped store keyed by **app id**, owning
  generation + concurrency; the per-window store only mirrors a live job.
  Rejected: block-close-while-busy and cancel-on-close (both defeat "walk away").
- **Cancel:** both queued and running. Running-cancel needs a **job id** passed
  to the main process so it can kill the correct child (mirrors the existing
  timeout kill in `core/agent`). Rejected: queued-only (weaker control).
- **Same-app second prompt:** queue it (FIFO per app). Rejected: hard-block the
  prompt box (can't line up iterations) and replace-pending (surprising).
- **Status/cancel UI:** agents counter in the title bar → popover with a
  cancellable job list. Rejected: passive counter (no central cancel) and a
  bottom bar near the prompt (crowds the input).

Open questions for planning:

- Queue is **in-memory / session-only**: a full app quit kills all subprocesses
  and drops queued jobs. Acceptable, or should pending work survive a restart?
- Exact "working indicator" visual (spinner vs badge) and the global counter's
  wording/format.
- `core/agent.ts` already holds the agent timeout; likely the natural home for
  the queue's framework-independent logic.

## Notes

Umgesetzt am 2026-08-08. Antworten auf die offenen Fragen:

- **Sitzungsweit** geblieben: Die Warteschlange lebt im Renderer, ein Programm-
  ende beendet die Kindprozesse und verwirft Wartendes. Ein Neustart würde
  Wünsche gegen einen Stand ausführen, den der Anwender nicht mehr vor Augen
  hat — das wäre überraschender als der Verlust.
- **Arbeitsanzeige**: ein kleiner laufender Ring (`BusyDot.vue`), gleich in
  Kachel, Dock und Fenstertitel. **Zähler**: `⚡ n` in der Titelleiste, n =
  laufend + wartend; der Tooltip nennt beides einzeln auf.
- Die Logik liegt **nicht** in `core/agent.ts`, sondern in einem eigenen
  `core/queue.ts` — `core/agent.ts` liest den CLI-Strom, das ist ein anderes
  Thema.

Aufbau:

- `src/core/queue.ts` — reine Logik: Deckel (`clampMaxAgents`, Vorgabe 2, 1–8)
  und `startableJobs` (FIFO, ein Agent je App). Ohne Electron/Pinia testbar.
- `src/stores/agents.ts` — die zentrale Warteschlange. Sie besitzt die
  Generierung: `submit` / `submitToActive` (aus `stores/desktop` hierher
  gewandert), `cancel`, `pump`, `runJob`. Ein Auftrag ist nach **App** (bzw. bei
  einem Entwurf nach Instanz-Id) geschlüsselt und läuft im Instanz-Store weiter,
  auch wenn dessen Fenster zugeht — dieser speichert und committet dann selbst.
  Ist die App inzwischen in einem anderen Fenster offen, wird dort nachgeladen.
- `stores/app.ts` — der Lauf ist abbrechbar: `runId` im State, `abortRun()`
  beendet über `cancelAgent` den Kindprozess und verwirft das Ergebnis samt des
  Wunsches im Dialog.
- Hauptprozess — `runningAgents` (Lauf-Id → Kindprozess) und
  `morphos:cancelAgent`; `maxAgents` in den Einstellungen.
- Oberfläche — `AgentsIndicator.vue` (Zähler + Liste mit Abbrechen),
  `BusyDot.vue`, Deckel-Schalter im Einstellungs-Dialog. Die Promptleiste nimmt
  jetzt auch während eines Laufs Wünsche an („Einreihen“).

## Log

- 2026-08-07 status → discuss (app)
- 2026-08-07 status → backlog (app)
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 status → review (agent)
- 2026-08-08 status → done (app)
