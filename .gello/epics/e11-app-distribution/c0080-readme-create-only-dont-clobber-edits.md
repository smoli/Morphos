---
id: c0080
title: "Readme: create-only, don't clobber hand-edits"
status: done
created: 2026-08-12
epic: e11
depends: [c0077]
tags: [readme, git]
status-changed: 2026-08-13T16:32:10
updated: 2026-08-13
usage-tokens: 30660
usage-cost: 2.97369
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

## Review

### 2026-08-12T22:53:31 — pass

Checked: alle vier Akzeptanzkriterien gegen den Code, der Diff von `5fface3`,
`npm test`, `npm run typecheck`. Lint gibt es in diesem Repo nicht (kein
eslint/prettier/biome, `package.json` hat nur `test`, `typecheck`, `build`).

- Kriterium 1 (schreiben, wenn keines dasteht): `writeReadme`
  (`src/core/readme.ts:230`) läuft bei fehlendem `README.md` unverändert durch
  bis `fs.writeFileSync` und liefert `{ created: true, text }`; der bestehende
  Test „schreibt das Readme aus Manifest und Konzept“ prüft Inhalt **und** jetzt
  `created === true`.
- Kriterium 2 (vorhandenes bleibt byte-für-byte, Hinweis, kein Commit): der
  Abbruch steht als erste Zeile in `writeReadme` (`readme.ts:231-232`) — vor
  Manifest, Icon-Aufräumen und Schreiben; `main.ts:863` kehrt bei `!created` vor
  `ensureRepo`/`commitAll` um, es wird also nichts committet. Test „rührt ein
  vorhandenes Readme nicht an (c0080)“ vergleicht den Dateiinhalt gegen ein
  Handschrift-Readme, bei geändertem `concept.md`.
- Kriterium 3 (Icon nur beim ersten Mal): das Aufräumen von `ICON_FILES` liegt
  hinter dem Abbruch, Test „fasst bei vorhandenem Readme auch das Icon nicht an
  (c0080)“ wechselt das Manifest-Icon auf ein Emoji und prüft, dass `icon.png`
  samt Inhalt liegen bleibt. Der Aufräum-Pfad selbst ist weiter geprüft — der
  Test „räumt beim Schreiben ein Bild-Icon weg“ löscht dafür jetzt zuerst das
  Readme, das ist die Anpassung an die neue Regel, keine Abschwächung.
- Kriterium 4 (Tests): `readme.spec` deckt create-when-absent und
  skip-when-present ab, `workspace.spec` reicht `{ ok: true, existed: true }`
  durch, `DesktopView.spec` prüft den `info`-Toast mit „schon ein Readme“.
  Einschränkung: das „kein Commit“ am IPC-Rand (`main.ts:863`) ist nur gelesen,
  nicht getestet — `electron/main.ts` hat in diesem Repo überhaupt keine
  Testdatei; `writeReadme` selbst committet ohnehin nie.
- `npm test`: 1551 Tests in 85 Dateien grün, kein `.only`, kein `skip` im Diff.
  `npm run typecheck` (vue-tsc) ohne Befund — der neue `ReadmeResult` ist durch
  Preload, Host-Typ und Store durchgezogen, `writeReadme` hat außer `main.ts`
  keinen weiteren Aufrufer.
- Diff bleibt im What: Code nur an der Readme-Kette, dazu die eine Log-Zeile in
  c0077, die das abgelöste „idempotent“-Kriterium vermerkt. Nebeneffekt, der zur
  Regel passt: steht ein Readme ohne `app.json` da, kommt jetzt `existed`
  statt des Manifest-Fehlers — „nichts anfassen“ gilt dann auch fürs Melden.

## Log

- 2026-08-12 created (follow-up from c0077 discussion)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 create-only umgesetzt, Tests grün, offene Frage bleibt gestellt
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
- 2026-08-13 status → done (app)
