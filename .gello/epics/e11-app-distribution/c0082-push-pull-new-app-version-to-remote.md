---
id: c0082
title: Push /pull new app version to remote
status: ready
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T23:25:24
epic: e11
order: 0
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

- [ ] Apps that **have an `origin` remote** show **„Push"/„Pull"** in the app-tile
      context menu; apps without a remote don't (publishing is c0083).
- [ ] **„Push"** pushes new local commits to `origin/<default-branch>`; if the
      remote has advanced (non-fast-forward) the push is **refused** with a
      "erst ziehen" message and is **never force-pushed**.
- [ ] **„Pull"** **fast-forwards** local to the remote when local hasn't diverged;
      on **real divergence** it **stops with a clear message and changes nothing**
      (resolution is c0084).
- [ ] An **ahead/behind indicator** on the app tile reflects the **last fetch**;
      remote state is fetched **on demand only** (menu open / explicit refresh /
      before a push or pull) — **never in the background**.
- [ ] Only the **default branch** (cloned, tracked as `origin/<branch>`) is synced;
      no branch switching.
- [ ] **Pull is refused while an agent is generating** for that app; after a
      successful pull, an **open app window reloads** to the new on-disk state.
- [ ] Auth reuses **system git + the `gh` credential helper** (like `cloneRepo`):
      public repos anonymously, private if configured; **auth/network failures**
      surface a clear error and **leave the repo unchanged**.
- [ ] Push/pull are **confined** to the app's own repo and use its **existing
      `origin`** (never a URL from app content); `chat.json` stays git-ignored and
      does not travel.
- [ ] Pure pieces (ahead/behind parsing, fast-forward-vs-divergence detection,
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

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 status → ready (app)
