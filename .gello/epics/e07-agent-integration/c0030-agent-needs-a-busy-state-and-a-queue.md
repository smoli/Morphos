---
id: c0030
title: Agent needs a busy state and a queue
status: ready
created: 2026-08-06
updated: 2026-08-08
status-changed: 2026-08-08T06:19:17
epic: e07
order: 20
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

- [ ] Max concurrent agents is configurable in ⚙ Settings (default **2**,
      global across the app); submitting beyond the limit **queues** the request
      instead of spawning another `claude` process.
- [ ] The queue is **FIFO**: when a running agent finishes and a slot frees, the
      next queued job starts automatically.
- [ ] Submitting a second prompt to an app that is already working **enqueues**
      it; it runs after the first completes, against the app's updated state. An
      app never has two agents running for it at once.
- [ ] Closing or leaving an app window while its agent runs does **not** cancel
      it; on completion the result is applied to the open window if present,
      otherwise **saved and committed** to the app on disk.
- [ ] A draft whose window is closed mid–first-generation is **finalized** into a
      real app on disk (id/name/icon derived, saved, committed).
- [ ] The user can **cancel a queued** request (removed, never runs) and a
      **running** agent (its `claude` subprocess is terminated); a cancelled run
      leaves the app unchanged and clears its busy state.
- [ ] The title bar shows a live **count** of running + queued agents; clicking
      it opens a **popover** listing each job by app name with a cancel control.
- [ ] Apps with a running or queued agent show a **working indicator** on their
      launcher tile, dock item, and window title bar.
- [ ] The queue logic (enqueue, concurrency cap, FIFO dequeue, cancel, per-app
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

## Log

- 2026-08-07 status → discuss (app)
- 2026-08-07 status → backlog (app)
- 2026-08-08 status → ready (app)
