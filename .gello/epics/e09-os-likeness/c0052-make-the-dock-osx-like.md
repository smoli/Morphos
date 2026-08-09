---
id: c0052
title: Make the dock OSX like
status: discuss
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T07:49:18
epic: e09
---

## What

Turn the bottom dock into a **macOS-style dock**. Left → right it holds: the
pinned **＋ New-App** (always there), the user's **favorite** apps (pinned,
stay even when closed), then any **running** apps not already pinned — each
running app carries a **running indicator**. It replaces today's
minimized-only dock; a minimized app is reachable from its dock item.

## Acceptance criteria

- [ ] The dock shows, in order: the **＋ New-App** pin, then **favorites**, then
      **running** apps not already pinned; an app that is both favorite and
      running appears **once** (with the running indicator).
- [ ] The launcher grid **no longer** contains a ＋ New-App tile — the ＋ lives
      only in the dock *(merged c0053)*.
- [ ] A **running indicator** marks currently-open apps; a favorite that isn't
      running shows without it.
- [ ] Clicking a dock item **focuses** the app's window, **restoring** it if
      minimized; clicking ＋ starts a new app. **No** minimize-on-second-click.
- [ ] Apps can be **pinned / unpinned** as favorites via the icon context menu
      (c0055, „Im Dock behalten“); favorites **persist per workspace** in Settings.
- [ ] Each dock item shows the app's icon (emoji or image) and its name on
      hover/tooltip.
- [ ] The dock **replaces** the old minimized-only dock (minimized apps live here
      now).
- [ ] Dock composition (order, favorite/running/duplicate handling) is pure logic
      covered by unit tests; rendering + click by component tests.

## Discussion

Decisions (interviewed 2026-08-09, Cluster A):

- **Contents = ＋ pin + favorites + running.** Rejected running-only and a
  minimal ＋-only dock. Favorites are a new persisted concept (per workspace,
  like `iconPositions` / `sessions`).
- **Click = focus / restore only.** Rejected the macOS minimize-on-second-click
  toggle for v1 (can add later).
- One item **per app** (opening an app focuses its single window), so the dock is
  app-level, not window-level.

Open questions for planning:

- Favorites **scope**: per-workspace (recommended, matches icon positions) vs
  global.
- Does the **file-explorer system window** (c0047) appear in the dock / be
  pinnable? (It's a system window, not an app.)
- **c0053 merged in** (2026-08-09): the grid→dock move of the ＋ is an acceptance
  criterion above; c0053 has been archived.
- Assumes the bottom edge is free — depends on the composer moving out of the way
  (Cluster B / c0056).

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (app)
- 2026-08-09 status → discuss (app)
