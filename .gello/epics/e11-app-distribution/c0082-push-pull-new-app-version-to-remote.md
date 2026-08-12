---
id: c0082
title: Push /pull new app version to remote
status: review
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T23:47:55
epic: e11
usage-tokens: 64670
usage-cost: 9.009208
---

## What

For an app that has an `origin` remote (imported via c0074), let the user **push**
new versions to the remote and **pull** new versions from it — from the app-tile
context menu, with an **ahead/behind** indicator. Since Morphos history is a chain
of **linear full-snapshot commits**, syncing is **fast-forward only**: a file-level
merge of generated code is never attempted. Only the **default branch** (the one
cloned) is synced.

Boundaries:

- **Publishing** a *local* app to a brand-new remote (add `origin` + first push)
  is a **separate follow-up** — see **c0083**.
- **Divergence resolution** (both sides advanced) is out of scope here: this card
  detects divergence and stops. The app-level "keep mine / take theirs" is a
  **follow-up** — see **c0084**.

## Acceptance criteria

- [x] Apps that **have an `origin` remote** show **„Push"/„Pull"** in the app-tile
      context menu; apps without a remote don't (publishing is c0083).
- [x] **„Push"** pushes new local commits to `origin/<default-branch>`; if the
      remote has advanced (non-fast-forward) the push is **refused** with a
      "erst ziehen" message and is **never force-pushed**.
- [x] **„Pull"** **fast-forwards** local to the remote when local hasn't diverged;
      on **real divergence** it **stops with a clear message and changes nothing**
      (resolution is c0084).
- [x] An **ahead/behind indicator** on the app tile reflects the **last fetch**;
      remote state is fetched **on demand only** (menu open / explicit refresh /
      before a push or pull) — **never in the background**.
- [x] Only the **default branch** (cloned, tracked as `origin/<branch>`) is synced;
      no branch switching.
- [x] **Pull is refused while an agent is generating** for that app; after a
      successful pull, an **open app window reloads** to the new on-disk state.
- [x] Auth reuses **system git + the `gh` credential helper** (like `cloneRepo`):
      public repos anonymously, private if configured; **auth/network failures**
      surface a clear error and **leave the repo unchanged**.
- [x] Push/pull are **confined** to the app's own repo and use its **existing
      `origin`** (never a URL from app content); `chat.json` stays git-ignored and
      does not travel.
- [x] Pure pieces (ahead/behind parsing, fast-forward-vs-divergence detection,
      remote-present detection) covered by **unit tests**; the fetch/push/pull
      orchestration lives in the main process.

## Discussion

Decisions (interviewed 2026-08-12):

- **Scope = sync apps that already have `origin`.** Publishing a *local* app to a
  new remote → follow-up **c0083**.
- **Fast-forward only.** Generated snapshots can't be 3-way merged, so push is
  refused on non-FF and pull only fast-forwards; **divergence resolution** is
  deferred to **c0084**.
- **App-tile context menu + ahead/behind badge**; remote fetched **on demand
  only** — no background network or surprise auth across all apps.
- **Default branch only**; **pull blocked during generation**, and an open window
  **reloads** after a successful pull.
- **Auth reuses system git + `gh`** (as clone) — no API-key handling in Morphos.

Rejected alternatives:

- **git merge/rebase on divergence** — would leave conflict markers inside
  generated source; meaningless for full-snapshot commits.
- **Background/periodic fetch** — surprise network + auth prompts for every
  remote-tracking app on the desktop.

Open questions for planning:

- Exact **badge wording/placement** (ahead/behind counts vs a dot) and how
  "unchecked" reads before the first fetch.
- Where the **remote URL** is surfaced (menu tooltip? part of c0083's flow?).
- Whether **pull's reload** reuses the existing `loadApp` path, and how an
  in-flight file dialog/picker in the open app is handled at reload.

## Notes

New `core/gitstore` helpers (system git, reuse `ghCredentialArgs` +
`NON_INTERACTIVE`): `hasRemote`/`getUpstream`, `fetchRemote`, `aheadBehind`
(`git rev-list --left-right --count HEAD...@{u}`), `pushRemote` (plain `push`,
never `--force`), `pullFastForward` (`merge --ff-only`). New main-process IPC
(e.g. `morphos:remoteStatus` / `morphos:pushApp` / `morphos:pullApp`) behind the
existing `knownWorkspaceError` + `appDir`/`safeId` guards, like `importApp`. The
"generating?" check reuses the agent/queue state; the reload reuses the desktop's
`loadApp` path.

### So gebaut (2026-08-12)

- **`core/remote`** (neu, rein): `parseAheadBehind`, `syncState`
  (`unknown|synced|ahead|behind|diverged`), `remoteBadge`, `pushProblem` /
  `pullProblem` (die Vorlauf-Regel), `nonFastForward`, `upstreamBranchName`,
  `hasOriginSection` — und die Zugangsmeldung `accessProblem`, die sich
  `appimport.cloneErrorMessage` (i0007) und der Abgleich jetzt teilen.
- **`core/gitstore`**: `hasRemote` (liest `.git/config` — kein Prozess je Kachel,
  kein Netz), `remoteUrl`, `getUpstream` (über `branch.<z>.remote`/`.merge`, nur
  `origin`), `fetchRemote`, `aheadBehind`, `pushRemote` (Ziel ausgeschrieben als
  `HEAD:refs/heads/<zweig>`, nie `--force`), `pullFastForward`.
- **Hauptprozess**: `morphos:remoteStatus` / `:pushApp` / `:pullApp`; `listApps`
  liefert je App `hasRemote`. Push und Pull holen IMMER zuerst — nur eine frische
  Zählung entscheidet über den Vorlauf.
- **Schale**: `workspace.remoteStatuses` (nur für die Sitzung, wird beim Wechsel
  des Verzeichnisses und beim Löschen vergessen), Kachelmenü mit „Push"/„Pull",
  Zeichen `.tile-remote` rechts oben an der Kachel.

Antworten auf die offenen Fragen:

- **Zeichen an der Kachel**: `⇅` = Gegenstelle vorhanden, noch nicht
  nachgesehen; danach `↑2` / `↓3` / `↑2↓3` / `✓`; `⚠` nur, wenn gar nicht
  gezählt werden konnte. Der Tooltip nennt den Zeitpunkt des letzten Holens.
- **Remote-URL**: bleibt vorerst unsichtbar (nur in `RemoteStatus.url` für die
  Fehlermeldungen) — sie sichtbar zu machen gehört zu c0083.
- **Neu laden nach dem Ziehen**: über den vorhandenen `loadApp`-Weg
  (`useAppWindow(...).open`), wie `stores/agents afterRun` es nach einem Lauf
  ohne Fenster tut. Ein laufender Dateidialog der App wird dabei nicht eigens
  behandelt — er gehört dem iframe, das neu geladen wird.

**Nicht abgedeckt**: Ein Klon eines LEEREN Repositories hat keinen verfolgten
Zweig; der Stand meldet das („verfolgt keinen Zweig auf origin"), statt einen
ersten Push zu bauen — das ist c0083.

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
