---
id: c0042
title: Telemetry — agent activity & disk usage
status: ready
epic: e09
depends: [c0039]
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:11:46
order: 40
---

## What

A light **telemetry** view in settings: how much **agent activity** is happening
(running / queued, maybe recent runs) and how much **disk** the apps and data
folder use (per-app sizes + total), so the user has a feel for cost and storage.

## Acceptance criteria

- [ ] A settings section shows current **agent activity**: running + queued
      counts (and, if available, recent runs) sourced from the agent queue.
- [ ] A **disk-usage** view lists per-app folder sizes and the data-folder total,
      computed in the **main process** (folder-size IPC) — the renderer never
      walks the filesystem itself.
- [ ] Sizes are human-readable (KB/MB) and refresh on open (or via a refresh
      action); computing them does not block the UI.
- [ ] Disk usage covers the workspace's apps and the data folder only — nothing
      outside.
- [ ] The folder-size computation is covered by unit tests (a temp tree of known
      sizes); the activity view by a component test with a stubbed queue.

## Notes

- "Agent activity" reads from the agent queue introduced in **e07 · c0030** —
  nicer once that lands, but the disk-usage half is independent.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
