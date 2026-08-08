---
id: c0040
title: Notifications / toasts
status: ready
epic: e09
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:11:41
order: 20
---

## What

A shell-level **toast/notification** system: transient messages that appear
briefly and stack, for events like „Agent fertig“, „Gespeichert“, or an error.
A single store + surface that any part of the shell can emit into, so features
don't each invent their own banner.

## Acceptance criteria

- [ ] A notifications store exposes `notify({ kind, text })` (kind:
      info / success / error) and holds the active toasts.
- [ ] A toast surface renders stacked toasts over the desktop; each **auto-
      dismisses** after a timeout and can be dismissed manually.
- [ ] Errors persist longer / until dismissed; info/success auto-fade.
- [ ] The surface is mounted once (App.vue) and is independent of any single
      window; toasts survive closing the window that triggered them.
- [ ] At least one real emitter is wired (e.g. a save error or an agent-finished
      event) as a usage example.
- [ ] Store + surface behaviour (enqueue, auto-dismiss, manual dismiss, cap on
      simultaneous toasts) is covered by unit/component tests.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
