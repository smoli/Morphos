---
id: e14
title: Host an app as a website
status: backlog
---

## Goal

A Morphos app calls **`window.morphosFS`** — fs (`readFile`, `writeFile`, `list`,
`exists`, `stat`, `mkdir`, `remove`) and dialogs (`openFile`, `saveFile`,
`pickDirectory`) — which the shell answers over `postMessage`. Hosted on a plain
web server there is **no shell to answer**, so the app breaks. This epic is the
**publish-to-web flow**: a standalone runtime that supplies those APIs without the
shell, plus the bundling and deploy that get an app onto the web.

Decided in discussion (was c0089, 2026-08-16):

- **Backing = a virtual sandbox filesystem (OPFS / IndexedDB)** — self-contained,
  no prompts. (File System Access API and no-op stubs rejected.)
- **Full API parity** — all fs ops **and** all three dialogs, mapped onto the
  virtual fs (dialogs use a small in-app picker over that fs, not the real disk).
- **Target = a static web server (https)** — a secure context, so OPFS works.
  **`file://` double-click is out of scope** (no secure context → no OPFS).
- **Deploy = both** — a portable bundle (folder/zip) for any static host
  **always**, plus **GitHub Pages** via the app's git remote (c0082/c0083) when it
  has one.

## Definition of done

An app that used the shell bridge can be **exported to a self-contained bundle**
that runs unchanged when **served over https**, with its data persisting via OPFS;
the bundle can be produced as a **portable folder/zip** for any static host, and —
when the app has a GitHub remote — **published to GitHub Pages**. The behavioural
differences from the shell are documented.

## Plan (steps + dependencies)

MVP is steps 1–2 (an app runs when hosted). Deploy convenience is 3–4; docs is 5.

1. **Standalone `morphosFS` runtime (OPFS/IndexedDB)** — reimplement the whole
   bridge (all fs ops + the three dialogs) against a per-origin virtual fs, a
   drop-in for the shell's `postMessage` bridge, incl. a minimal in-app picker for
   the dialogs. Pure/core, unit-tested. *(root)*
2. **Hostable bundle / export** — produce a self-contained `index.html` with the
   runtime injected **in place of** the shell bridge, plus a hosting-appropriate
   **CSP** (tight but https-serving, not the offline `default-src 'none'`) and any
   assets. (← step 1)
3. **Portable static-bundle export** — package the bundle as a folder/zip the user
   can drop on **any** static host, independent of git. (← step 2)
4. **GitHub Pages deploy** — build + push the bundle to a Pages branch via the
   app's **git remote** (reuse c0082/c0083); handle Pages **enablement** within
   the "no API key" stance. Offered only when the app has a GitHub remote.
   (← step 2)
5. **Docs: hosted-vs-shell behaviour** — user documentation of the differences and
   limits (sandboxed virtual fs vs a granted real folder; `file://` unsupported;
   OPFS is per-origin). (← step 3, step 4)

Open questions:

- **Dialog picker UX** over a virtual fs — the minimal in-app file picker needs a
  small design (step 1).
- **Hosting CSP** — settle the exact policy for step 2 (self-referential assets
  over https, still no exfiltration).
- **GitHub Pages enablement** — pushing a `gh-pages`/`docs` branch is plain git,
  but *turning Pages on* may need repo settings or the `gh` API; reconcile with
  "no API key" (push + instruct, or use `gh`, the existing credential path).
- **OPFS namespacing** when several apps share one host origin (one Pages site per
  repo keeps them apart; a shared host needs per-app scoping).
- Fulfils concept.md's **"index.html eigenständig öffenbar"** promise for
  API-using apps.
