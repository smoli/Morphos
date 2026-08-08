---
id: c0033
title: Provide system file dialogs
status: in-progress
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T06:50:49
epic: e0001
usage-tokens: 5724
usage-cost: 0.963674
---

Die drei „offenen Fragen für die Planung“ aus der Discussion — bitte je eine Option ankreuzen (meine Empfehlung ist jeweils markiert). Danach baue ich durch.

**1. Dateityp-Filter (Endungen) für open/save**

- [x] a) v1: `openFile({ extensions: ['txt','md'] })` blendet nicht passende Dateien aus; `saveFile` hängt die erste Endung an, wenn keine getippt wurde. **(Empfehlung — klein, und der Agent baut sonst eigene Filterlogik)**
- [ ] b) Später — v1 ohne Filter, Optionsobjekt bleibt erweiterbar.

**2. Modalität des Pickers**

- [ ] a) Globaler Modal wie `PermissionDialog` (in `App.vue`, Zustand im workspace-Store, Warteschlange: nur ein Picker gleichzeitig auf dem ganzen Desktop). **(Empfehlung — genau das Muster, das der Berechtigungsdialog schon hat; „einer pro App“ ist damit erfüllt)**
- [x] b) Pro Fenster modal (Overlay im `WindowFrame`), mehrere Fenster können gleichzeitig je einen Picker zeigen.

**3. Neuen Unterordner im Dialog anlegen (save / pickDirectory)**

- [x] a) Ja, in v1: Knopf „Neuer Ordner“ im Dialog (legt ihn direkt im Datenordner an, ohne `mkdir`-Berechtigungsprompt — der Anwender klickt ihn ja selbst).
- [ ] b) Nein, später — v1 lässt nur vorhandene Ordner wählen; die App kann weiterhin `morphosFS.mkdir` nutzen. **(Empfehlung — hält v1 klein, und es ist der einzige Punkt, der eine Schreiboperation am Berechtigungsgatter vorbei einführen würde)**

## What

The shell provides scoped file dialogs so generated apps don't each hand-build
their own file browser. Three pickers — **open file**, **save file**, **pick
directory** — rendered by Morphos in its own trusted UI and confined to the
workspace's data folder. Apps invoke them through `window.morphosFS` and get back
a **relative path** (or `null` on cancel), then use the existing
`readFile`/`writeFile`. The system prompt tells the agent to use these instead of
rolling its own picker.

## Acceptance criteria

- [x] `window.morphosFS` exposes `openFile()`, `saveFile()` and
      `pickDirectory()`; each resolves to a path **relative to the data folder**,
      or `null` if the user cancels.
- [x] The picker is rendered by the **Morphos shell** (trusted renderer), not
      inside the app iframe, and shows only the data folder and its subfolders —
      it cannot navigate above the data root.
- [x] `saveFile` lets the user choose a target folder within the data folder and
      type a filename (pre-filled from an optional suggested name) and **confirms
      before overwriting** an existing file.
- [x] Returned paths are relative, `/`-separated, and confined to the data
      folder; the app uses the existing `readFile`/`writeFile` with them.
- [x] Reading/writing a dialog-chosen path **still goes through the per-function
      permissions** (open→read, save→write); opening the picker itself adds no
      extra prompt.
- [x] If no data folder is configured, the dialog calls **reject with a catchable
      error** (consistent with the rest of `morphosFS`).
- [x] Only one picker is shown at a time per app; the call is modal and returns a
      single result.
- [x] `SYSTEM_PROMPT` documents `openFile`/`saveFile`/`pickDirectory` and
      instructs the agent to use them for user file selection instead of building
      its own file browser.
- [x] The dialog request/response travels over the existing `postMessage` bridge
      with the same source-checking as fs requests (an app only receives
      responses to its own requests).
- [x] Bridge/logic (request validation, path confinement, cancel) is covered by
      unit tests; the prompt change is covered by the prompt spec.

## Discussion

Decisions (interviewed 2026-08-08):

- **Shell-rendered, scoped picker** (not native OS dialog): data-folder
  confinement is the whole point — a native dialog lets the user browse anywhere
  and would need after-the-fact rejection. Bonus: consistent look, and the
  sandboxed app can't fake or restyle it (it renders in the trusted renderer).
- **Path-returning API** (not content-carrying): the picker returns a relative
  path; the app then uses the existing `readFile`/`writeFile`. Keeps the dialog
  orthogonal to I/O and reuses the permission gate. Rejected content-carrying
  (convenient, but duplicates the I/O + consent paths).
- **Permissions still apply after a pick** (no consent bypass): a dialog-chosen
  read/write runs the normal ask/allow/deny; opening the picker adds no prompt of
  its own. Rejected treating the pick as implicit consent — one consistent gate.
- **All three dialogs in v1:** open, save (with overwrite confirm), pick
  directory.

Open questions for planning:

- File-type **filters** (extensions) for open/save — v1 or later?
- Rendering: a dedicated modal like `PermissionDialog`, and multi-window
  modality (tie the modal to the requesting window vs a global modal).
- Should the picker allow **creating a new subfolder** from within save /
  pick-directory?

## Log

- 2026-08-08 status → discuss (app)
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
