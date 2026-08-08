---
id: c0040
title: Notifications / toasts
status: review
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:20:28
usage-tokens: 18985
usage-cost: 1.94572
---

## What

A shell-level **toast/notification** system: transient messages that appear
briefly and stack, for events like „Agent fertig“, „Gespeichert“, or an error.
A single store + surface that any part of the shell can emit into, so features
don't each invent their own banner.

## Acceptance criteria

- [x] A notifications store exposes `notify({ kind, text })` (kind:
      info / success / error) and holds the active toasts.
- [x] A toast surface renders stacked toasts over the desktop; each **auto-
      dismisses** after a timeout and can be dismissed manually.
- [x] Errors persist longer / until dismissed; info/success auto-fade.
- [x] The surface is mounted once (App.vue) and is independent of any single
      window; toasts survive closing the window that triggered them.
- [x] At least one real emitter is wired (e.g. a save error or an agent-finished
      event) as a usage example.
- [x] Store + surface behaviour (enqueue, auto-dismiss, manual dismiss, cap on
      simultaneous toasts) is covered by unit/component tests.

## Notes

- `core/toasts.ts` hält die framework-freie Logik: Standzeit je Art
  (info/success 4 s, **error 0 = bleibt bis zum Wegklicken**) und der Deckel
  `MAX_TOASTS = 4`; `overflow()` nennt die ältesten Meldungen, die einer neuen
  Platz machen.
- `stores/notifications.ts` ist der Stapel (`notify` / `info` / `success` /
  `error` / `dismiss` / `clear`). Die Uhren liegen wie die laufenden Läufe in
  `agents` bewusst außerhalb des States.
- `components/ToastStack.vue` hängt einmal in `App.vue` — unten rechts,
  `pointer-events: none` auf dem Stapel, damit er die Fläche nicht blockiert;
  Fehler bekommen `role="alert"`.
- Erster Melder: `agents.announce()` nach jedem Lauf — „«App» ist fertig.“ bzw.
  der Fehlertext. Ein abgebrochener Lauf meldet nichts, ein Lauf ohne Fenster
  meldet trotzdem.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 core/toasts + notifications-Store + ToastStack umgesetzt, in
  App.vue eingehängt, Agentenläufe melden hinein; 548 Tests grün, vue-tsc sauber
- 2026-08-08 status → review (agent)
