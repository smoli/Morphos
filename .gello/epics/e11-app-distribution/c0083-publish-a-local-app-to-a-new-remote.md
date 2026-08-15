---
id: c0083
title: Publish a local app to a new remote
status: review
created: 2026-08-12
epic: e11
depends: [c0082]
tags: [git, distribution]
status-changed: 2026-08-15T22:59:05
updated: 2026-08-15
usage-tokens: 46283
usage-cost: 6.78962
---

# Publish a local app to a new remote

A locally-created app has **no `origin`** — so it can't be shared. Give it a
first-time **publish**: the user provides a remote URL (a repo they created),
Morphos adds it as `origin` and pushes the app's history. After that, the app is
an ordinary remote-tracking app and c0082's push/pull applies.

## What

A per-app action „App veröffentlichen…" (shown when the app has **no** remote)
that prompts for a **remote URL**, sets it as `origin`, and does the **initial
push** of the app's branch/history. Morphos does **not** create the remote repo
(no GitHub API / no API-key stance) — the user creates an empty repo first and
pastes its URL.

## Acceptance criteria

- [x] A per-app action **„App veröffentlichen…"** appears **only when the app has
      no `origin`**; once published, it's replaced by c0082's Push/Pull.
- [x] The user supplies the **remote URL**; Morphos sets it as `origin` and does
      the **initial push** of the default branch (setting upstream).
- [x] Uses **system git + the `gh` credential helper** (like clone/push);
      auth/network failures surface a clear error and **leave `origin` unset** if
      the first push fails (no half-published state).
- [x] Morphos **does not create** the remote repo; the message makes clear the
      user must create an (ideally empty) repo first. Pushing to a **non-empty**
      remote is refused cleanly (that's c0082/c0084 territory).
- [x] The URL comes from the **user**, not app content; the operation is confined
      to the app's own repo.

## Discussion

- Split out of **c0082**: that card assumes an existing `origin`; this one creates
  it. Together they cover the full share loop (publish → push/pull → import).
- Open: how much to help with a **missing/non-empty remote** — just a clear error,
  or guidance? Creating the remote via `gh repo create` was considered but
  rejected for now (keeps the no-API-key stance; the user owns the remote).

## Notes

### So gebaut (2026-08-15)

- **`core/remote`** (rein, neuer Abschnitt c0083): `remoteRefNames` (was auf der
  Gegenstelle liegt, aus `ls-remote`), `publishProblem` (schon ein `origin` /
  noch keine Version), `remoteNotEmptyMessage` (die saubere Absage samt Weg:
  leeres Repo anlegen — oder die App holen statt schieben) und
  `publishErrorMessage`, das sich `accessProblem` (i0007) mit Klonen und
  Abgleichen teilt.
- **`core/gitstore`**: `currentBranch` (über `symbolic-ref`, auch ohne Commit),
  `remoteRefs` (`ls-remote --heads --tags -- <adresse>` mit `ghCredentialArgs` +
  `NON_INTERACTIVE`) und `publishRepo` = `remote add -- origin <adresse>` +
  `push -u origin HEAD:refs/heads/<zweig>`; scheitert der Push, wird `origin`
  wieder ENTFERNT.
- **Hauptprozess**: `morphos:publishApp` hinter `knownWorkspaceError` +
  `appDir`/`safeId`, Adresse durch `repoUrlError` (dieselbe Prüfung wie beim
  Holen). Reihenfolge mit Absicht: prüfen → bei der Gegenstelle nachfragen
  (`ls-remote`, sie muss erreichbar UND leer sein) → erst dann eintragen und
  schieben. Vor dem ersten geglückten Push existiert kein `origin`.
- **Schale**: `workspace.publishApp(id, url)` (merkt den Stand, liest bei Erfolg
  neu ein — die Kachel bekommt ihr Zeichen), Kachelmenü zeigt „App
  veröffentlichen…" **statt** Push/Pull, wenn `hasRemote` fehlt; neuer
  `components/PublishAppDialog` fragt nach der Adresse und sagt ausdrücklich,
  dass das **leere** Repository der Anwender selbst anlegt.

Antwort auf die offene Frage (missing/non-empty remote): **klare Absage mit
Weg**, keine Automatik. Eine Adresse, die es nicht gibt, klingt wie ein
fehlender Zugang (`accessProblem` nennt gh/ssh); eine volle Gegenstelle bekommt
einen eigenen Satz, der auf „leeres Repository anlegen" bzw. „App aus Git
laden…" verweist. `gh repo create` bleibt draußen (kein API-Schlüssel im Haus).

**Nicht abgedeckt**: Der Zweigname auf der Gegenstelle ist immer der lokale
(kein Umbenennen nach `main`), und wer die Adresse während des Veröffentlichens
füllt, bekommt die Absage von git selbst (dann bleibt `origin` ungesetzt).

## Log

- 2026-08-12 created (split from c0082)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → backlog (app)
- 2026-08-15 status → ready (app)
- 2026-08-15 status → in-progress (agent)
- 2026-08-15 status → review (agent)
