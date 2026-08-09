---
id: c0057
title: represent file explorer and settings like regular apps
status: in-progress
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T10:17:59
epic: e09
---

# represent file explorer and settings like regular apps

they are persistent in the dock

## What

The shell's own views — the **file explorer** and the **settings** — stop being
special: they become ordinary desktop windows with a **permanent place in the
dock**, left of the user's favorites. Settings in particular stops being a modal
dialog over everything and becomes a window like any other (move, resize,
minimize, maximize, switcher, session restore).

## Acceptance criteria

- [x] **Settings is a window**, not a modal: `core/system` knows a second view
      `settings`, `SystemWindow` renders it, and every existing way in (⚙ in the
      top bar, Strg/⌘ + `,`, „Datenordner festlegen …“ in the explorer) opens
      that window. `SettingsDialog` / `stores/shell` are gone.
- [x] **Both views stand permanently in the dock** — right after the fixed ＋,
      before the favorites, whether they run or not; a separator sets them off
      from the apps.
- [x] A **running indicator** marks them while open, exactly like an app; a click
      opens them, or focuses / restores the existing window. There is never more
      than one window per view.
- [x] They **cannot be pinned or unpinned** (no context menu) — they are always
      there; deleting an app or emptying the favorites leaves them untouched.
- [x] The redundant „📁 Dateien“ button on the desktop surface is **gone** — the
      dock is the way in.
- [x] Both views **come back with the session** after a restart, at their old
      place and size, alongside the app windows.
- [x] Dock composition stays pure logic with unit tests (`core/dock`), session
      round-trip likewise (`core/session`); windowing + clicks by component tests.

## Notes

- **`core/system`** führt jetzt zwei Ansichten (`explorer`, `settings`) — ihre
  Reihenfolge dort ist ihre Reihenfolge im Dock. Mehr braucht eine neue Ansicht
  nicht: Eintrag hier, Komponente in `SystemWindow`, fertig.
- **`core/dock`** bekam einen vierten Parameter `systems`. Die festen Plätze
  stehen vor den Lieblingen, tragen den Schlüssel `sys:<id>` (eine App darf
  „explorer“ heißen, ohne zu kollidieren) und nehmen das offene Fenster ihrer
  Ansicht auf, damit es nicht zusätzlich als „laufend“ hinten auftaucht. Ein
  Fenster einer *unbekannten* Ansicht fällt weiter hinten heraus, statt zu
  verschwinden. 7 neue Unit-Tests.
- **Einstellungen sind kein Dialog mehr.** `SettingsDialog` ist zu
  `settings/SettingsPanel` geworden (dieselbe Seitenleiste, ohne Rahmen, Titel
  und Kreuz — das gehört jetzt dem Fenster); `stores/shell` ist damit ersatzlos
  weg, alle drei Wege hinein rufen `desktop.openSystem(SETTINGS_ID)`.
- **Sitzung:** `SessionWindow` trägt zusätzlich `systemId` (`appId` darf null
  sein). Alte gespeicherte Sitzungen bleiben unverändert lesbar, App-Einträge
  werden weiterhin ohne `systemId` geschrieben. Eine Ansicht, die es nicht mehr
  gibt, fällt beim Wiederherstellen weg wie eine gelöschte App.
  *Nebenwirkung, bewusst:* Ein offen gelassenes Einstellungsfenster ist beim
  nächsten Start wieder da — wie am Mac.
  *Bekannte Kante (schon vorher so):* `restoreSession` wartet auf die Apps des
  Verzeichnisses; in einem Verzeichnis ganz ohne Apps kommt darum auch ein
  gemerktes System-Fenster nicht zurück.
- **Testhygiene:** `DesktopView.spec` baut die montierte Ansicht jetzt nach
  jedem Test wieder ab. Vorher blieben die Tastenhorcher aller ~90 Ansichten
  hängen; sobald eine davon eine Aktion auf ihrem alten Store auslöste, zeigte
  Pinias `activePinia` wieder auf dessen Verzeichnis und der laufende Test las
  plötzlich fremde Fenster. Das fiel erst auf, weil Strg/⌘ + `,` jetzt ein
  Fenster öffnet statt nur ein Flag zu setzen.
- Geprüft: `npx vitest run` (1037 Tests grün), `npx vue-tsc --noEmit`,
  `npm run build`. Ein Lauf in der echten Electron-App fand nicht statt
  (Ordnerauswahl ist ein nativer Dialog) — belegt ist alles über die
  Komponententests.

## Log

- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 Einstellungen als System-Fenster (SettingsPanel, shell-Store weg),
  feste Dock-Plätze in core/dock, System-Fenster in der Sitzung
