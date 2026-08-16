---
id: c0089
title: Wrapper to host an app as a website
status: discuss
created: 2026-08-15
updated: 2026-08-16
status-changed: 2026-08-16T07:30:34
epic: e11
---

## What

A Morphos app calls **`window.morphosFS`** — fs (`readFile`, `writeFile`, `list`,
`exists`, `stat`, `mkdir`, `remove`) and dialogs (`openFile`, `saveFile`,
`pickDirectory`) — which the shell answers over `postMessage`. Hosted on a plain
web server there is **no shell to answer**, so the app breaks. This card is a
**publish-to-web flow**: a standalone runtime that supplies those APIs without the
shell, plus the bundling and deploy that get an app onto the web.

Three parts:

- **Runtime shim** — reimplements all of `morphosFS` against a **virtual
  filesystem (OPFS / IndexedDB)**, a drop-in for the shell bridge. The dialogs
  present the **virtual fs** via a small in-app picker (not the real disk).
- **Bundle / export** — a self-contained `index.html` (shim injected in place of
  the shell bridge, a hosting-appropriate CSP) + assets, ready to serve over
  **https**.
- **Deploy** — a **portable bundle** (folder/zip) for any static host **always**,
  plus **GitHub Pages** via the app's git remote (c0082/c0083) when it has one.

Target is a **static web server (https)** — a secure context, so OPFS works.
`file://` double-click is **out of scope** (no secure context → no OPFS).

## Acceptance criteria

- [ ] A standalone `morphosFS` runtime implements **all** fs ops **and** all three
      dialogs **without a parent shell**, backed by a **per-origin OPFS/IndexedDB**
      virtual fs; an app written for the shell bridge runs unchanged against it.
- [ ] The dialogs (`openFile`/`saveFile`/`pickDirectory`) operate over the
      **virtual fs** (a minimal in-app picker) and honour the shell's contract.
- [ ] An **export** produces a self-contained bundle (shim-injected `index.html` +
      assets) that runs when **served over https**, and its data **persists**
      across reloads (OPFS).
- [ ] A **portable bundle** (folder/zip) can be produced for **any** static host,
      independent of git.
- [ ] With a **GitHub remote**, a **GitHub Pages** path builds + pushes the bundle
      and serves it; **without** a remote, only the portable bundle is offered.
- [ ] Behaviour differences from the shell (sandboxed virtual fs vs a granted real
      folder; `file://` unsupported) are **documented** for the user.
- [ ] The runtime's fs semantics (paths, ops, errors) are covered by **unit tests**
      against the OPFS/IndexedDB backing.

## Discussion

Decisions (interviewed 2026-08-16):

- **Backing = virtual sandbox fs (OPFS/IndexedDB)** — self-contained, no prompts.
- **Full API parity** (all fs ops + all three dialogs) mapped onto that fs.
- **Target = static https host**; **`file://` explicitly out** (no OPFS there).
- **Deliverable = the full publish-to-web flow** (shim + bundle + deploy).
- **Deploy = both**: portable bundle always; **GitHub Pages** via the app's git
  remote (c0082/c0083) when present.

Rejected alternatives:

- **File System Access API** backing — Chromium-only, gesture-bound.
- **No-op / read-only stubs** — useless for apps that actually use fs.
- **Shim-only, no export** — the human wants the end-to-end flow.

Open questions / for planning:

- **This is epic-sized.** Recommend promoting to its own epic and breaking down:
  runtime shim ▸ bundle/export (CSP for hosting) ▸ portable deploy ▸ Pages deploy
  ▸ user docs. (Offer: run `gello-plan` on it.)
- **Dialog UX over a virtual fs** — a minimal in-app file picker needs a small
  design.
- **Hosting CSP** — the shell injects an offline `default-src 'none'`; a hosted
  bundle needs a still-tight but https-appropriate policy — settle the exact one.
- **GitHub Pages enablement** — pushing a `gh-pages`/`docs` branch is plain git
  (already have it), but *turning Pages on* may need repo settings or the `gh`
  API; reconcile with the "no API key" stance (push + instruct, or use `gh`, the
  existing credential path).
- **OPFS namespacing** when several apps share one host origin (one Pages site per
  repo keeps them apart; a shared host needs per-app scoping).
- Fulfils concept.md's **"index.html eigenständig öffenbar"** promise for
  API-using apps.

## Log

- 2026-08-16 status → discuss (app)
