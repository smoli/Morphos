---
id: c0116
title: "Asset storage — assets/ folder, binary IO, git, survive src/ sync"
status: review
epic: e16
depends: []
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:38:05
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

- [x] Assets are stored under `<app>/assets/` and read/written as binary
      (no UTF-8 round-trip).
- [x] `readSourceFiles`/`syncSourceFiles` never read or delete `assets/`; an
      asset survives a generation that doesn't mention it.
- [x] Adding an asset copies it into `assets/`; filenames are sanitized and
      name collisions are handled (no silent overwrite).
- [x] Removing an asset deletes only that file.
- [x] Add/remove is committed by git like other app files.
- [x] A separate `AssetFile`/`AssetInfo` model exists; `AppData` exposes
      metadata-only `AssetInfo` (name, path, mime, size) — no asset bytes held
      in memory — and assets never appear in `files: SourceFile[]`.
- [x] IPC handlers `listAssets`/`readAsset`/`addAsset`/`removeAsset` exist and
      read bytes on demand (no size cap in v1).
- [x] Specs cover: binary round-trip, survival across a `src/` sync, name
      sanitize/collision, and the git commit.

## Notes

Root card of e16. Implements the resolved "type model" decision (separate
`AssetFile`/`AssetInfo`, metadata-only in `AppData`, bytes on demand via own
IPC). Everything else (bundle inlining, prompt attach, panel) builds on the
storage model and ops defined here.

**Built (2026-08-27)**

- `src/core/assets.ts` — the pure model (renderer-safe, no `node:fs`), split
  from the disk access the way `core/design` is split from `core/designstore`:
  `AssetInfo` (name, path, mime, size) and `AssetFile` (+ `data: Uint8Array`),
  `ASSETS_DIR`, `assetPath`/`assetName`/`isAssetPath`, `sanitizeAssetName`,
  `uniqueAssetName`, `assetMime`. Own MIME table (fonts + SVG included) —
  `core/preview`'s deliberately serves only image/video/audio; c0117 needs
  fonts and SVG for its `data:` URIs.
- `src/core/assetstore.ts` — the disk side (main process): `listAssets`
  (metadata only), `readAsset` (bytes on demand, binary), `addAsset`,
  `removeAsset`. Add/remove each do `ensureRepo` + `commitAll`
  ("Asset hinzugefügt/entfernt: <name>"), so a revert brings assets back.
- `AppData.assets?: AssetInfo[]`, filled by `loadAppFromDisk`; assets never
  enter `files: SourceFile[]`. Optional like `docs?` so old app states and the
  renderer-test literals stay valid.
- IPC `morphos:listAssets/readAsset/addAsset/removeAsset` (main + preload +
  `Host`). Bytes cross the bridge as **base64** (`AssetContent`), because every
  consumer in the shell builds a `data:` URI from them (as with icon and
  wallpaper) — on disk it stays binary. No size cap.
- `addAsset(folder, id, name, data)` takes the BYTES, not a source path: the
  panel (c0119) reads a picked/dropped `File` in the renderer, so no
  native-dialog path has to be trusted in the main process (unlike the
  transient `Attachment` flow).
- No change was needed to keep assets out of the `src/` sync — `readSourceFiles`
  only walks `src/`, `syncSourceFiles` only wipes `src/`. The specs now pin it
  down. The agent also cannot write there: `isValidOutputPath` (core/files)
  keeps him inside `src/` + the two docs.

Specs: `src/core/assets.spec.ts` (17), `src/core/assetstore.spec.ts` (14 —
binary round-trip with 0x00/0x80/0xFF, survival across a `src/` sync, sanitize
and collision, remove-only-that-file, both commits, revert), plus one in
`appstore.spec.ts` for the metadata in `AppData`. Full suite green (2150),
`vue-tsc` clean.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-27 status → in-progress (agent)
- 2026-08-27 core/assets + core/assetstore gebaut, AppData.assets, IPC-Vierer;
  Specs grün (2150), typecheck sauber.
- 2026-08-27 status → review (agent)
