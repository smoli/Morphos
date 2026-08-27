---
id: c0115
title: Posibility to add assets
status: backlog
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T22:37:59
---
# Posibility to add assets

## What

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

## Acceptance criteria

- [ ] Adding a file through the panel copies it into `<app>/assets/` (git-tracked);
      filenames are sanitized and name collisions are handled.
- [ ] Assets are stored/read as **binary** and are NOT touched by
      `readSourceFiles`/`syncSourceFiles` — they survive a generation that never
      mentions them.
- [ ] Adding/removing an asset is committed by git like other app files.
- [ ] The asset panel lists assets (name, type, size), previews the selected
      one, and can remove an asset.
- [ ] A wish can attach one or more **stored** assets; the prompt lists each with
      its in-app path `assets/<name>` (images additionally `Read`-able).
- [ ] `bundle` resolves `assets/…` references into `data:` URIs — at least
      `<img src>` and CSS `url(...)`; an absent/unresolved reference is left
      untouched (no crash).
- [ ] End-to-end for the common types: image (png/jpg/svg/webp), font (woff2),
      and a data file (json/csv).
- [ ] Removing an asset that code still references degrades gracefully.
- [ ] Specs cover: binary round-trip + survival across sync, `data:` inlining in
      `bundle`, attaching a stored asset into the prompt, and panel add/remove.

## Discussion

**Decisions**
- **Storage — top-level `assets/`, not `src/`.** `src/` is text-only:
  [`readSourceFiles`](../../src/core/appstore.ts) reads it as UTF-8 and
  `syncSourceFiles` wipes and rewrites the whole folder from the in-memory
  string set each generation — a binary under `src/` would be corrupted on read
  and deleted on the next run. `assets/` sits outside that path, git-tracked.
- **Runtime — inline as `data:` URI at bundle time.** The app runs offline in a
  sandboxed iframe under CSP; `data:` URIs are the offline-safe way to use an
  asset. Extends [`bundle`](../../src/core/bundle.ts), which today inlines
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

**Open questions**
- **Bundle bloat / size cap.** `data:` URIs inflate `index.html`; no hard cap
  decided. Suggested default: warn on large assets, no hard limit in v1.
- **Fonts / CSS `url()`.** Confirm the bundle rewrite covers `@font-face url(...)`
  and font MIME types, not just `<img>`.
- **Type model.** Whether `SourceFile { content: string }` gains a binary sibling
  or assets get their own on-disk model (`AssetFile`) — likely modelled separately.

## Log

- 2026-08-27 status → discuss (app)
