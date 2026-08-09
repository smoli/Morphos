---
id: c0056
title: Open the composer on demand
status: review
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T08:35:49
epic: e09
---

## What

The composer is **hidden by default**. It opens **on demand for a specific app**,
**attached to that app's window** (a per-window panel at the window's bottom), via
a **💬 title-bar button** and a **keyboard shortcut**; **Esc** closes it. Creating
a **new app** opens it automatically (a draft has nothing to show yet — folds in
c0054). It carries that app's chat history, input, attachments, and live agent
activity — moved off the old global bottom bar. While it's closed, a **busy
badge** shows a running agent, and a **clarifying question auto-opens** it. After
sending, it **stays open** for iteration.

## Acceptance criteria

- [x] The composer is **hidden by default**; the desktop no longer has a permanent
      bottom composer bar (nor the „active app“ context chip).
- [x] Each app window has a **💬 title-bar toggle** and a **keyboard shortcut** to
      open/close its composer; **Esc** closes it.
- [x] The composer opens **attached to the focused app's window** (per-window),
      carrying that app's chat history, input, attachments, and live activity.
- [x] **Creating a new app** opens its window with the composer already open and
      focused *(merged c0054)*.
- [x] While an agent runs with the composer closed, a **busy indicator** shows on
      the window (and dock, c0052); a **clarifying question auto-opens** the
      composer for that app.
- [x] After the user sends a prompt, the composer **stays open**; it closes only
      on Esc / toggle. *(„Clicking away“ ist bewusst NICHT gebaut — siehe Notes.)*
- [x] In **single mode**, the composer opens attached to the full-screen app the
      same way.
- [x] Toggle state, auto-open-on-question, and new-app auto-open are covered by
      component tests.

## Discussion

Decisions (interviewed 2026-08-09, Cluster B; **c0054 merged in**):

- **Per-window, attached** to the app's window — not a bottom-docked bar.
  Rejected docked-while-open (fights the dock for the bottom edge and keeps the
  now-redundant context chip). Fits „open it *for an app*“.
- **Triggers:** 💬 title-bar button + keyboard shortcut; Esc closes; **new app
  auto-opens** the composer (this was c0054).
- **Running agent stays reachable:** a **busy badge** whenever an agent runs, and
  the composer **auto-opens on a clarifying question**. Rejected badge-only (easy
  to miss a question).
- **Stays open** after submit, for back-and-forth. Rejected auto-hide.

Consequences / open questions:

- This **relocates the existing `ChatDock`** (input + expandable history + pop-out
  + attachments) from `DesktopView`'s footer into the window frame, hidden by
  default with a toggle — and removes the global composer + context-chip built
  earlier.
- **Shortcut choice:** add a toggle to `core/shortcuts` (avoid clashes; ⌘/Ctrl+W,
  +M are already shifted). Pick the chord at planning.
- **Ties to the agent queue (c0030):** the busy badge + auto-open should be driven
  by the agent/queue state and the window/dock running indicators (c0052) — build
  order matters.
- Keep the **pop-out chat window** available from the per-window composer?

## Notes

- Supersedes **c0054** (composer on new-app click) — merged here as the „new app
  auto-opens“ trigger.

Umsetzung (2026-08-09):

- **Zustand je Fenster** im Instanz-Store (`stores/app`: `composerOpen` plus
  `openComposer/closeComposer/toggleComposer`). Damit gehört der Chat demselben
  Zustand wie Verlauf und Lauf — er überlebt den Abstecher zum Desktop und stirbt
  mit dem Fenster. `newDraft()` öffnet ihn, `generate()` öffnet ihn bei einer
  Rückfrage: beides im Store, nicht in der Ansicht, damit es auch dann greift,
  wenn das Fenster gerade nicht gezeichnet ist.
- **Kürzel: Strg/⌘ + ⇧ + C** (Chat) — es folgt dem Muster der übrigen
  Fensterbefehle (⇧ + Buchstabe) und kollidiert mit keinem davon; ⌘C bleibt dem
  Wirtsfenster.
- **Escape** greift an zwei Stellen: am Composer selbst (aus dem Eingabefeld
  heraus, wo kein Kürzel gilt) und im Desktop für das aktive Fenster. Ist das
  Startmenü offen, gehört Escape zuerst ihm.
- **„Clicking away“ nicht gebaut.** Ein Klick in die laufende App ist der
  Normalfall beim Ausprobieren — würde er den Chat schließen, ginge halb
  Getipptes verloren. Esc und der 💬-Knopf bleiben die beiden Wege.
- **Pop-out (⧉) bleibt** (offene Frage der Planung): Er ist gebaut, getestet und
  verliert durch den Ortswechsel nichts.
- Zwei Folgeänderungen: Der Verlauf **überlagert nicht mehr selbst** (das tut nun
  die Composer-Leiste als Ganzes, gedeckelt auf 60 % der Fensterhöhe), und er
  steht beim Öffnen **offen** — wer den Chat eigens aufruft, will ihn sehen. Die
  Fehlermeldung des Fensters wandert dafür an den oberen Rand.
- `agents.submitToActive` ist mit der globalen Leiste entfallen; jeder Wunsch
  kommt jetzt aus dem Fenster, an dem er hängt (`agents.submit`).
- Am laufenden Programm geprüft (Electron, Fenster- und Einzel-Modus): Öffnen,
  Zuklappen des Verlaufs, Escape, Kürzel, neuer Entwurf mit offenem Chat.

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 status → ready (shell build sequence root)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 status → review (agent)
