---
id: c0090
title: "App model — type: website"
status: backlog
epic: e13
depends: []
created: 2026-08-16
updated: 2026-08-16
tags: [websites, app-model]
---

# App model — type: website

Introduce a **kind** to the app manifest so a website app can exist alongside the
generated apps: `type: 'generated' | 'website'` plus a `url` carried by website
apps. Existing apps have no `type` and must read as `generated`; a website app
has no `src/` and never goes through generation.

## What

Extend `AppMeta`/`app.json` with a `type` discriminator (default `generated`) and
a `url` field for website apps. Migration reads any manifest **without** a `type`
as `generated` (unchanged on disk until next write). Validation: a `website` app
requires a valid `url`; a `generated` app must not carry one. Website apps reuse
the folder + desktop model (an `app.json`, an icon; **no** `src/`, `index.html`,
`concept.md`, `userdocumentation.md`).

## Acceptance criteria

- [ ] `AppMeta` gains `type: 'generated' | 'website'` and an optional `url`
      (present iff `type === 'website'`), with the types threaded through
      manifest read/write.
- [ ] A manifest **without** `type` loads as `generated` (back-compat), and is not
      rewritten merely by being read.
- [ ] Manifest validation **rejects** a `website` app without a valid `url`, and a
      `generated` app that carries a `url`.
- [ ] `AppSummary`/desktop tile data expose the `type` so the shell can branch on
      it (host, chrome, creation).
- [ ] The generation/versioning pipeline is unaffected for `generated` apps.
- [ ] Pure pieces (parse, migrate-default, validate) covered by **unit tests**.

## Notes

- Touches `src/types` (`AppMeta`/`AppData`/`AppSummary`), `core/appstore`
  (`readManifest`/`writeManifest`/migration) and `core/app` validation. This is
  the **root** card of e13 — host (c0092), creation (c0094) and chrome-gating
  (c0095) all read `type`.

## Log

- 2026-08-16 created from the e13 epic breakdown
