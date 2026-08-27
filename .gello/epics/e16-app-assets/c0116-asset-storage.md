---
id: c0116
title: "Asset storage — assets/ folder, binary IO, git, survive src/ sync"
status: in-progress
epic: e16
depends: []
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:29:30
---

# Asset storage — assets/ folder, binary IO, git, survive src/ sync

## What

The foundation of the epic: store an app's asset files under a top-level
`<app>/assets/` folder, read and written as **binary** (not UTF-8), tracked by
git like any other app file. Assets must sit entirely outside the `src/`
text-sync so a generation that never mentions them leaves them intact —
`readSourceFiles`/`syncSourceFiles` (`core/appstore`) must neither read nor
delete them.

**Model (decided):** a separate `AssetFile`/`AssetInfo` type — assets never
enter `files: SourceFile[]`. `AppData` carries metadata-only
`AssetInfo { name, path (e.g. `assets/logo.png`), mime, size }`; the bytes are
NOT held in memory but read on demand through their own IPC, mirroring the
existing `morphos:readDesign`/`writeDesign` pattern:
`listAssets` / `readAsset` / `addAsset` / `removeAsset`. **No size cap in v1.**

## Acceptance criteria

- [ ] Assets are stored under `<app>/assets/` and read/written as binary
      (no UTF-8 round-trip).
- [ ] `readSourceFiles`/`syncSourceFiles` never read or delete `assets/`; an
      asset survives a generation that doesn't mention it.
- [ ] Adding an asset copies it into `assets/`; filenames are sanitized and
      name collisions are handled (no silent overwrite).
- [ ] Removing an asset deletes only that file.
- [ ] Add/remove is committed by git like other app files.
- [ ] A separate `AssetFile`/`AssetInfo` model exists; `AppData` exposes
      metadata-only `AssetInfo` (name, path, mime, size) — no asset bytes held
      in memory — and assets never appear in `files: SourceFile[]`.
- [ ] IPC handlers `listAssets`/`readAsset`/`addAsset`/`removeAsset` exist and
      read bytes on demand (no size cap in v1).
- [ ] Specs cover: binary round-trip, survival across a `src/` sync, name
      sanitize/collision, and the git commit.

## Notes

Root card of e16. Implements the resolved "type model" decision (separate
`AssetFile`/`AssetInfo`, metadata-only in `AppData`, bytes on demand via own
IPC). Everything else (bundle inlining, prompt attach, panel) builds on the
storage model and ops defined here.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-27 status → in-progress (agent)
