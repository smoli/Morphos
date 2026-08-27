---
id: c0116
title: "Asset storage — assets/ folder, binary IO, git, survive src/ sync"
status: review
epic: e16
depends: []
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:46:46
usage-tokens: 47804
usage-cost: 5.035977
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

**Nachbesserung nach dem Review (2026-08-27)**

Die Namenslänge wurde an zwei Stellen getrennt gerechnet, und genau dazwischen
lag der Fehler: `sanitizeAssetName` schöpfte die 80 Zeichen aus, `uniqueAssetName`
hängte danach `-2` an — 82 Zeichen, die `assetName` nicht mehr annimmt. Die Datei
wurde geschrieben und committet, tauchte aber in `listAssets` nicht mehr auf und
ließ sich weder lesen noch entfernen; der nächste gleiche Name überschrieb sie
dann stillschweigend. Ebenso konnte eine überlange ENDUNG allein schon einen zu
langen Namen liefern.

- Beides geht jetzt durch EIN `fitName(stem, ext, suffix)`: die einzige Stelle,
  an der über die Länge entschieden wird. Gekürzt wird zuerst der Name, die
  Endung nur, wenn sie allein den Platz beansprucht; der Zusatz bleibt ganz —
  er ist es, der die Dateien unterscheidet.
- `addAsset` schreibt zusätzlich nur noch, was `isAssetPath` auch wieder
  annimmt (Riegel gegen einen Rückfall).
- Neue Specs: überlange Endung, Zählung an der Längengrenze (auch über zwölf
  Runden), und auf der Platte — derselbe überlange Name dreimal hinzugefügt
  ergibt drei auffindbare Dateien mit ihren eigenen Bytes, jede entfernbar;
  dazu die Zusicherung, dass im Asset-Ordner nichts liegt, was die Liste nicht
  kennt.

Specs: `src/core/assets.spec.ts` (21), `src/core/assetstore.spec.ts` (16 —
binary round-trip with 0x00/0x80/0xFF, survival across a `src/` sync, sanitize
und collision — auch dort, wo beides zusammentrifft —, remove-only-that-file,
both commits, revert), plus one in `appstore.spec.ts` for the metadata in
`AppData`. Full suite green (2156), `vue-tsc` clean.

## Review

### 2026-08-27T23:40:49 — fail

Checked: acceptance criteria against `src/core/assets.ts`, `src/core/assetstore.ts`,
`src/types/index.ts`, `electron/main.ts`, `electron/preload.ts`; the diff of 8e079cc;
`npm test` (2150 passed / 101 files, green); `npm run typecheck` (`vue-tsc --noEmit`,
clean). No lint step exists in this repo (no `lint` script, no eslint config) — not run.

- Criterion "name collisions are handled (no silent overwrite)" is unmet at the
  length boundary. `sanitizeAssetName` (`src/core/assets.ts`) truncates every name
  to exactly `MAX_ASSET_NAME_LENGTH` (80), but `uniqueAssetName` then appends
  `-2` **without** re-applying that budget, so the collision name is 82 chars —
  longer than `isValidAssetName` allows. `addAsset` writes and commits that file,
  and from then on it is invisible and unreachable: verified against the real code
  in a temporary spec — after `addAsset(dir, 'x'.repeat(76) + '.png')` twice,
  `readdirSync(assetsDir(dir))` shows both files, `listAssets` returns only the
  80-char one, `readAsset(dir, second.path)` is `null` and
  `removeAsset(dir, second.path)` is `false`. The user adds an asset, it lands in
  a commit, and it never shows up in the panel (c0119) nor can be deleted there.
- Worse, the same path then **does** silently overwrite. A third `addAsset` of the
  same long name sees only the 80-char entry in `listAssets`, so `uniqueAssetName`
  hands back `…-2.png` again and `writeFileSync` replaces the second asset's bytes
  (probe: `[[82, 3], [80, 1]]` on disk — the byte `2` written by the second add is
  gone). That is exactly the silent overwrite the criterion forbids.
  This is not an exotic input: any name over 80 chars is truncated to the same
  80-char prefix, so long filenames are precisely the ones that collide, and
  colliding is precisely what breaks them. Fix by bounding the result of
  `uniqueAssetName` (or re-sanitizing after it) to `MAX_ASSET_NAME_LENGTH`, and
  consider making `addAsset` refuse to write a name `isAssetPath` would reject.
- Same root cause, second reachable input: an extension of 80+ chars makes
  `sanitizeAssetName` return a name longer than the maximum on its own
  (`room = Math.max(1, MAX - cleanExt.length)`; probe: `a.` + `'b'*100` → 102 chars).
  The existing spec "kürzt einen überlangen Namen und behält dabei die Endung"
  only covers a long *stem*, so nothing catches this.
- Criterion "Specs cover: … name sanitize/collision" is therefore unmet in
  substance: `assets.spec.ts` tests truncation and collision separately but never
  together, so the boundary where they interact is untested.

Verified as passing, for the record: binary IO is genuinely binary (`readFileSync`
without an encoding, `writeFileSync` of the `Uint8Array`) and the round-trip is
pinned with 0x00/0x80/0xFF in `assetstore.spec.ts`; assets survive a `src/` sync
(`readSourceFiles` walks only `src/`, `syncSourceFiles` `rmSync`s only `src/`, both
covered by spec); `removeAsset` deletes only the named file; add and remove are each
one `ensureRepo` + `commitAll`, and the revert spec shows assets come back with a
version; the `AssetInfo`/`AssetFile` split is real, `AppData.assets` is
metadata-only and assets never enter `files: SourceFile[]` (`appstore.spec.ts`);
all four IPC handlers exist in main + preload + `MorphosHost` and read bytes on
demand with no size cap; path escapes (`assets/../app.json`, absolute paths) are
rejected at the name; the diff is additive only (732 insertions, 0 deletions) — no
test weakened, skipped or `.only`'d, and nothing outside the card's What.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-27 status → in-progress (agent)
- 2026-08-27 core/assets + core/assetstore gebaut, AppData.assets, IPC-Vierer;
  Specs grün (2150), typecheck sauber.
- 2026-08-27 Review abgelehnt: Namenslänge und Zählung getrennt gerechnet —
  ein hochgezählter Name konnte 82 Zeichen lang und damit unauffindbar werden
  (und wurde beim nächsten Mal stillschweigend überschrieben).
- 2026-08-27 behoben: ein gemeinsames `fitName` für beide Wege, Riegel in
  `addAsset`, sechs neue Specs an der Grenze. Suite grün (2156).
- 2026-08-27 status → review (agent)
- 2026-08-27 status → in-progress (agent)
- 2026-08-27 status → review (agent)
