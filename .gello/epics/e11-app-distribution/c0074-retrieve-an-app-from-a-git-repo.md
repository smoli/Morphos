---
id: c0074
title: Retrieve an app from a git repo
status: backlog
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T20:28:07
epic: e11
order: 10
---

## What

Import an app **from a git repo**. Since every Morphos app already *is* its own
git repo, sharing = push the folder to a remote and importing = clone it back. A
desktop action **„App aus Git laden…“** prompts for a repo URL; Morphos **clones**
it (keeping history + the `origin` remote), **verifies** it's a Morphos app
(`app.json`), resolves any **id collision** by asking the user, and adds it to the
workspace's apps folder so it appears on the desktop.

## Acceptance criteria

- [ ] A desktop action **„App aus Git laden…“** (beside „Neue App“ / the dock ＋)
      prompts for a **repo URL** and starts the import.
- [ ] Morphos **clones** the repo (system git, default branch) into a temp
      location, **keeping `.git` and the `origin` remote** (a real clone).
- [ ] The clone is **validated as a Morphos app**: `app.json` exists at the root,
      parses, and has an `id`/`name`; otherwise the import is **rejected** with a
      clear message and the temp clone is removed.
- [ ] On an **id collision** with an existing app, the user is **asked**: import
      **as a copy** (new unique id + folder, `app.json` id updated → a commit;
      display name kept), **replace** the existing app (with confirmation), or
      **cancel**.
- [ ] On success the app is moved into the workspace's **apps folder** and the
      desktop **list refreshes** so it appears; opening it works (old-format
      `app.json` still migrates as usual).
- [ ] Uses **system git credentials** — public repos work anonymously, private
      ones work if the user's git is configured; **auth/clone failures** surface a
      clear error and clean up the temp clone.
- [ ] The clone is **confined to the workspace**; the URL comes from the **user**,
      not from app content. Cancel/failure leave the workspace unchanged.
- [ ] Pure pieces (app-json validation, collision detection + rename to a unique
      id) covered by **unit tests**; the clone/move orchestration lives in the
      main process.

## Discussion

Decisions (interviewed 2026-08-12):

- **Entry point:** a desktop launcher action „App aus Git laden…“ (beside „Neue
  App“ / the dock ＋).
- **Keep the clone + `origin`** (real clone with history) — enables a future
  „Aktualisierung ziehen / zurückschieben“ card; Morphos commits new generations
  on top.
- **Collision → ask** (Kopie / Ersetzen / Abbrechen), not silent auto-rename;
  „Ersetzen“ confirms (destructive), never touches the existing app otherwise.
- **System git credentials** — public + private (if configured); no credential
  handling in Morphos (matches the „kein API-Key“-Haltung).

Open questions for planning:

- **Branch/ref:** default branch only, or allow choosing a branch/tag?
- **Progress/errors:** how the clone shows progress and reports failures (toast vs
  modal), and where exactly the action sits (launcher tile vs a menu).
- **Chat comes along?** `chat.json` is git-ignored, so an imported app arrives
  **without its dialog history** — expected (only the app + its two docs travel).
- The **export/share half** (making an app pushable to a remote) is a **sibling
  card** in e11 — this card is **import only**.

## Notes

- Reuses `core/gitstore` (system git) for the clone, `core/appstore`
  (`readManifest` / `loadAppFromDisk` / migration) for validation + loading, and
  `core/app` (`makeAppId`) for the rename-on-copy. **Clone into a temp dir**, read
  `app.json`, *then* move into `<workspace>/<id>` — the final folder name follows
  the (possibly renamed) id.
- New main-process handler (e.g. `morphos:importApp`): clone → validate → resolve
  → move; the renderer prompts for the URL and the collision choice.

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 status → backlog (app)
