---
id: c0075
title: Add option to open Desktop host folder
status: review
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T21:14:14
epic: e11
commit: 892d273
usage-tokens: 50820
usage-cost: 5.947099
---

# Add option to open Desktop host folder

in File handler (Explorer, Finder, etc,) and in terminal. Make it a function
that’s in the settings dialog

## What

The **desktop's host folder** is the workspace directory — the folder that holds
this desktop's apps, one subfolder (and git repo) per app. A settings section
**„Arbeitsverzeichnis“** shows that path and opens it where the user works with
it directly: in the **system file manager** (Finder / Explorer / Dateien) and in
a **terminal** (cwd = the folder), for everything Morphos does not do itself —
`git push`, a look at the files.

## Acceptance criteria

- [x] The settings dialog has a section for the desktop's folder that **shows
      the path** of the current workspace.
- [x] **„Im Dateimanager öffnen“** opens that folder in the system file manager
      (main process, `shell.openPath`).
- [x] **„Im Terminal öffnen“** opens a terminal **in** that folder on macOS,
      Windows and Linux — the platform's terminal, the folder as its working
      directory.
- [x] Both only ever open a **known workspace folder** (in `recentFolders`, like
      `diskUsage`/`importApp`) that still exists; anything else is refused with a
      clear message.
- [x] Without an open workspace or without the host bridge (renderer test,
      browser) the buttons are **disabled**; a failure shows the main process's
      **message** in the section.
- [x] The platform-specific terminal choice and the PATH lookup are covered by
      **unit tests**; the section itself by component tests.

## Notes

Implemented (2026-08-12):

- `core/terminal` (new, main process only): `terminalCandidates` lists what can
  open a terminal per platform, `pickTerminal` takes the first one that exists on
  this machine, `openTerminal` spawns it **detached + unref** — the terminal
  belongs to the user afterwards and outlives Morphos.
  - macOS: `open -a Terminal <dir>` (the folder as an argument — `open` starts
    Terminal.app, so a cwd would not travel).
  - Windows: Windows Terminal (`wt -d <dir>`), else `cmd /c start "" cmd`; the
    Eingabeaufforderung stays as a fallback even when PATH does not yield it.
  - Linux: `x-terminal-emulator`, gnome-terminal, konsole, xfce4-terminal, tilix,
    alacritty, kitty, xterm — no folder argument (every terminal spells that
    option differently), the folder is the child's **cwd**.
- `core/which` (new): `findOnPath` — PATH first, then the usual places, because a
  program started from the Dock does not inherit the login shell's PATH.
  `gitstore.findGh` now delegates to it instead of carrying its own copy.
- The file manager side needs no module of its own: Electron's `shell.openPath`
  does it, and it reports failure as **text**, not as an exception.
- IPC `morphos:revealFolder` / `morphos:openTerminal`; both go through
  `knownWorkspaceError` — a **known** workspace folder (defense in depth: an
  arbitrary renderer path would otherwise become a launcher for anything that
  opens on a double-click) that still exists.
- UI: `components/settings/WorkspaceFolderSection` registered in `sections.ts`
  right before the Datenordner — the store actions `revealFolder`/`openTerminal`
  return `{ok, error}` and the section shows the message inline.
- Scope: the **desktop's** folder, as the card says — the Datenordner keeps its
  own section without these two buttons, and single apps are not opened
  individually (that would be a card of its own).
- Verified against the real system as well: on this Mac `pickTerminal` resolves
  `/usr/bin/open` and `openTerminal` really opens Terminal.app in the folder.

## Review

### 2026-08-12T21:17:54 — pass

Checked: alle Akzeptanzkriterien gegen den Code, der Diff von 892d273, `npm test`
und `npm run typecheck` (ein Lint gibt es im Repo nicht — keine eslint-Konfiguration,
kein `lint`-Skript in `package.json`).

- Pfad-Anzeige: `WorkspaceFolderSection.vue` zeigt `workspace.folder` in
  `.folder-path`, sonst „Kein Arbeitsverzeichnis geöffnet.“; der Bereich hängt
  über `sections.ts` (`id: workspace`) in `SETTINGS_SECTIONS` und damit im
  `SettingsPanel` — dessen Bestandstest zählt alle Bereiche mit.
- Dateimanager: `ipcMain.handle('morphos:revealFolder')` in `electron/main.ts`
  ruft `shell.openPath` und gibt dessen Textfehler als `{ok:false,error}` zurück.
- Terminal: `core/terminal.terminalCandidates` — macOS `open -a Terminal <dir>`,
  Windows `wt.exe -d <dir>` bzw. `cmd.exe /c start "" cmd.exe`, Linux die acht
  üblichen ohne Ordner-Argument; `openTerminal` spawnt mit `cwd: dir`,
  `detached` + `unref`, so dass das Fenster Morphos überlebt.
- Bekannter Ordner: beide Kanäle gehen durch `knownWorkspaceError` —
  `readSettings().recentFolders.includes(folder)` plus `fs.existsSync`, also die
  Prüfung von `diskUsage` und zusätzlich die Existenz. Ein beliebiger Pfad aus
  dem Renderer wird mit klarer Meldung abgelehnt.
- Knöpfe/Meldung: `:disabled="!workspace.folder || !canReveal|!canTerminal || busy"`,
  `canReveal/canTerminal` prüfen `typeof host.revealFolder === 'function'`;
  `run()` schreibt `res.error` in `.error`. Vom Komponententest abgedeckt
  (fehlende Anbindung, kein Ordner, Fehlermeldung des Hauptprozesses).
- Tests: `src/core/terminal.spec.ts` (7) deckt die Plattformwahl inklusive
  Windows-Rückfall ab, `src/core/which.spec.ts` (6) die PATH-Suche gegen ein
  echtes tmp-Verzeichnis, `src/stores/workspace.spec.ts` die Store-Aktionen,
  `WorkspaceFolderSection.spec.ts` (6) den Bereich. Kein `.only`, kein `.skip`,
  keine abgeschwächte Zusicherung im Diff.
- `npm test`: 1509 Tests in 83 Dateien grün. `npm run typecheck` (`vue-tsc
  --noEmit`, deckt `electron/**` mit ab): fehlerfrei.
- Diff bleibt im What: nur der neue Bereich, die zwei IPC-Kanäle, `core/terminal`,
  `core/which` und die Umstellung von `gitstore.findGh` auf `findOnPath` — eine
  Entdopplung derselben PATH-Suche. Anmerkung ohne Folgen: die Vorgabe-Plätze
  wachsen dabei um `/bin` (`GH_PLACES` → `COMMON_PLACES`), die gitstore-Tests
  bleiben grün.
- Nicht geprüft, weil das Repo dafür keine Ebene hat: die IPC-Handler in
  `electron/main.ts` (es gibt keine Tests im Hauptprozess) und der echte
  `spawn` — die Karte verweist hier auf eine Handprobe auf diesem Mac.

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 status → backlog (app)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
- 2026-08-12 implemented in 892d273 (agent)
