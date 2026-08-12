---
id: c0080
title: "Readme: create-only, don't clobber hand-edits"
status: review
created: 2026-08-12
epic: e11
depends: [c0077]
tags: [readme, git]
status-changed: 2026-08-12T22:51:53
updated: 2026-08-12
---

# Readme: create-only, don't clobber hand-edits

The „Readme erstellen" action (c0077) **rewrites `README.md` on every run**
(idempotent overwrite). That silently discards any hand-edits: someone who
tweaks the generated README and re-triggers the action loses their changes.
Make README generation **create-only** — write only when `README.md` is absent,
and otherwise leave the existing file untouched.

## What

Change the readme flow so an existing `README.md` is never overwritten. When one
is already present, the action reports that (toast) instead of rewriting. This
matches the discussion decision for c0077 (*create-only, don't clobber edits*),
which the shipped implementation diverged from.

## Acceptance criteria

- [x] Running „Readme erstellen" when **no `README.md` exists** writes it as
      today (unchanged behaviour).
- [x] Running it when a `README.md` **already exists** leaves the file
      **byte-for-byte untouched** and reports "README exists already" via toast —
      no commit is made.
- [x] Any accompanying **icon asset** is only written on first creation; an
      existing README run touches neither the README nor the icon file.
- [x] Covered by unit tests (`readme.spec`): create-when-absent, skip-when-present
      (no write, no commit), and the store/menu action's "already exists" result.

## Discussion

- Open question: keep a way to **explicitly regenerate/overwrite** (e.g. a
  separate „Readme neu erstellen" or a confirm) for when the author *does* want
  the fresh template back — or leave that until an export flow needs it. The
  c0077 discussion deferred an explicit overwrite option.
  → Bleibt weiter zurückgestellt: Diese Karte baut nur create-only, kein
  zweiter Menüeintrag. Wer die Vorlage zurück will, löscht das Readme und ruft
  die Aktion erneut auf.

## Notes

Die Entscheidung fällt in `core/readme`, nicht am Rand: `writeReadme` schaut
als Erstes, ob `README.md` schon dasteht, und kehrt dann sofort um — vor dem
Manifest, vor dem Icon-Aufräumen. Damit gilt „nichts anfassen“ auch für die
Bilddatei daneben (ein Icon-Wechsel räumt `icon.png` sonst weg).

- `writeReadme` liefert jetzt `{ created, text }` statt nur den Text
  (`readme.ts:224`); bei einem dastehenden Readme ist `created: false` und
  `text` der vorgefundene Inhalt.
- Die IPC (`main.ts:852`) committet nur bei `created` — und dann immer mit
  „Readme erstellt“; die Nachricht „Readme aktualisiert“ ist entfallen, weil es
  kein Aktualisieren mehr gibt. Sonst kommt `{ ok: true, existed: true }`
  zurück (neuer Typ `ReadmeResult`, durch Preload und Store durchgereicht).
- Der Menüeintrag meldet das als **Hinweis**-Toast (`info`, nicht `success`):
  „„Rechner" hat schon ein Readme — es bleibt, wie es ist."
- Tests: `readme.spec` — vorhandenes Readme bleibt byte-für-byte stehen (und
  ein Handschrift-Readme überlebt ein geändertes Konzept), das Bild-Icon bleibt
  dabei liegen, das Aufräumen alter Icons wird beim echten Schreiben weiter
  geprüft; `workspace.spec` reicht `existed` durch, `DesktopView.spec` prüft
  den Hinweis-Toast. `npm test` (1551) und `npm run typecheck` sind grün.
- c0077s Kriterium „Running it again rewrites the file (idempotent)" ist damit
  abgelöst; im Log dieser Karte vermerkt.

## Log

- 2026-08-12 created (follow-up from c0077 discussion)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 create-only umgesetzt, Tests grün, offene Frage bleibt gestellt
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
