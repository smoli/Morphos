---
id: e09
title: OS Likeness
status: backlog
---

## Goal

Make Morphos feel like a real desktop OS. On top of the existing multi-window
desktop, add a customizable desktop (wallpaper, freely arrangeable icons), a
fuller settings experience, a read-only file explorer for the data folder,
session restore, a searchable launcher, keyboard-driven window/app switching,
system notifications, and light telemetry (agent activity + disk usage).

Everything stays confined to the workspace **data folder** (no real-filesystem
browsing); no virtual desktops and no multi-user/accounts in v1.

## Definition of done

- Each capability below ships as an independent, tested slice.
- The desktop **persists its state** across restarts: open windows + geometry,
  icon arrangement, and wallpaper.
- No change broadens filesystem access beyond the data folder.

## Plan (steps + dependencies)

Mostly-parallel features on the existing shell; the dependency graph is shallow.
"(existing)" marks the card that already lives in this epic.

1. **Proper settings dialog** — restructure „Einstellungen“ into a sectioned /
   tabbed shell (sidebar categories) as the home for new settings. (root)
2. **Notifications / toasts** — a shell toast system (store + surface) that other
   features emit into (agent finished, saved, errors). (root)
3. **File explorer** — read-only data-folder browser with previews
   (image / video / markdown-as-HTML / JSON pretty+highlighted / text).
   *(existing card c0038)* (root)
4. **Desktop wallpaper** — set a background image/color for the desktop surface;
   configured in settings, rendered by the desktop, persisted. (← step 1)
5. **Telemetry** — agent activity + per-app / data-folder **disk usage**
   (main-process folder-size IPC), shown in settings. (← step 1)
6. **Arrange desktop icons** — free-position app icons on the desktop surface and
   persist their layout (grid stays the fallback). (root)
7. **Restore session on restart** — persist which windows were open + their
   geometry and reopen them on launch. (root)
8. **Searchable launcher** — a start-menu / spotlight overlay to search and open
   apps (keyboard-first), beside the icon grid. (root)
9. **Keyboard shortcuts + app switcher** — global shortcuts (new / close /
   minimize / settings) and a Cmd·Ctrl+Tab switcher overlay over open windows.
   (root)

Notes for card creation:

- Only step 3 already exists (**c0038**, currently `discuss`) — it is **not**
  recreated; it stays as the file-explorer card. Steps 1–2 and 4–9 become new
  cards (next free ids from **c0039**).
- Soft dependencies: steps 4 and 5 depend on step 1 only so their config UI has a
  home in the revamped settings — decouple them if you'd rather build in parallel.
- Cross-epic touchpoint: telemetry's "agent activity" reads from the agent queue
  (e07 · c0030); not a hard dependency, but nicer once that lands.
