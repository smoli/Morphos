---
id: e16
type: epic
title: "App assets"
status: backlog
---

# App assets

## Goal

Let the user add **asset files** (images, fonts, data files, …) to an app and
use them in it. Assets live in a top-level `assets/` folder in the app, are
tracked by git like any other file, and survive generations untouched — they
sit **outside** the `src/` text-sync. A dedicated **asset-manager panel** lists
the app's assets with add / remove / preview.

When writing a wish, the user can **attach one or more stored assets** to that
wish. The prompt then names each attached asset by its in-app path
(`assets/<name>`) — and, for images, lets the agent `Read` it — so the agent can
wire it into the code (`<img src="assets/logo.png">`, `url(assets/…)`, `@font-face`).
At bundle time, static references to `assets/…` are **inlined as `data:` URIs**,
so the app uses them offline under the sandbox CSP.

(Promoted from card c0115 after discussion; that id is retired, not reused.)

## Definition of done

- Assets are stored under `<app>/assets/`, read/written as **binary**, tracked
  by git, and never touched by `readSourceFiles`/`syncSourceFiles` — they
  survive a generation that never mentions them.
- An asset-manager panel lists the app's assets and can add, preview and remove
  them; adds/removes are committed by git like other app files.
- A wish can attach one or more stored assets; the prompt names each by its
  in-app path `assets/<name>` (images additionally `Read`-able).
- `bundle` inlines `assets/…` references (`<img src>`, CSS `url(...)`) as
  `data:` URIs; an absent/unresolved reference is left untouched (no crash).
- Works end-to-end for the common types: image (png/jpg/svg/webp), font
  (woff2), and a data file (json/csv).

## Discussion

**Decisions**
- **Storage — top-level `assets/`, not `src/`.** `src/` is text-only:
  [`readSourceFiles`](../../../src/core/appstore.ts) reads it as UTF-8 and
  `syncSourceFiles` wipes and rewrites the whole folder from the in-memory
  string set each generation — a binary under `src/` would be corrupted on read
  and deleted on the next run. `assets/` sits outside that path, git-tracked.
- **Runtime — inline as `data:` URI at bundle time.** The app runs offline in a
  sandboxed iframe under CSP; `data:` URIs are the offline-safe way to use an
  asset. Extends [`bundle`](../../../src/core/bundle.ts), which today inlines
  only CSS/JS/libs.
- **Ownership — user adds/removes; agent references only.** Binary content can't
  be LLM-authored as text, and the agent's write scope is `src/` + the two docs.
- **Agent visibility — per-wish attach, not an always-on inventory.** The user
  points the agent at a specific stored asset ("use this here"). This differs
  from today's transient `Attachment` (an absolute path from the native dialog,
  not stored): the new attach targets a file that already lives in the app.
- **First slice handles all file types** (image/font/data) from the start.

**Rejected / deferred**
- Assets under `src/` (rejected: needs invasive binary-aware sync; deletion risk).
- The morphosFS data folder (rejected: per-workspace runtime data, not
  git-tracked app source — contradicts the card).
- An always-listed `ASSETS` prompt section (deferred in favour of per-wish attach).

**Resolved** (discussed 2026-08-27)
- **Type model — a separate `AssetFile`/`AssetInfo`, not a binary `SourceFile`.**
  `SourceFile` is text the agent owns and flows through `syncSourceFiles` (which
  deletes anything not in the set), the picker and the prompt — binary there
  would reintroduce the deletion risk. Assets never enter `files: SourceFile[]`;
  `AppData` carries metadata-only `AssetInfo { name, path, mime, size }` (no
  bytes in memory), with bytes read on demand through their own IPC
  (`listAssets`/`readAsset`/`addAsset`/`removeAsset`, mirroring
  `morphos:readDesign`/`writeDesign`). `bundle` stays pure: it receives an asset
  map `Record<'assets/x.png', dataURI>` the way it already takes `libs`, built
  in `generate.ts` by reading the assets dir. → c0116 (+ c0117 for the map).
- **Bundle coverage — broad in v1.** One resolver, applied to `<img src>`,
  `srcset`, `<video>/<audio>/<source>` `src`, `poster`, SVG `<image href>`,
  inline `style="…url()"` attributes, and CSS `url(...)` in both inline
  `<style>` and bundled `src/*.css` (so `@font-face` works). MIME table incl.
  fonts; SVG as a base64 `data:` URI; an unresolved reference is left untouched.
  → c0117.
- **Size — no cap in v1.** `bundle` never fails on size; no per-file or total
  cap. The raw bytes are versioned once under `assets/`; the base64 in
  `index.html` is accepted bloat. Revisit only if repos get heavy. → c0116/c0119.
- **Read path for image attach.** The agent's working directory IS the app
  folder, so an attached image asset is `Read`-able at its relative path
  (`assets/logo.png`) — no absolute-path plumbing like transient attachments.
  → c0118.

## Plan (steps + dependencies)

1. Asset storage — `assets/` folder + binary IO + git + survive `src/` sync.
   Model assets on disk (their own type / on-disk model), read+write as binary,
   sanitize names + handle collisions, keep them out of
   `readSourceFiles`/`syncSourceFiles`, and commit add/remove via git. The
   foundation everything else builds on.
2. Bundle inlining — extend `core/bundle` to resolve `assets/…` references
   (`<img src>` and CSS `url(...)`) into `data:` URIs with the right MIME per
   type; leave absent/unresolved references untouched. (← step 1)
3. Per-wish asset attach — let a wish attach one or more STORED assets;
   `buildPrompt` names each by its in-app path `assets/<name>` (images also
   `Read`-able), distinct from today's transient `Attachment`. (← step 1)
4. Asset-manager panel — a shell panel that lists the app's assets (name, type,
   size), adds via file picker / drag-drop, previews the selected one, and
   removes an asset (graceful when code still references it). (← step 1)
