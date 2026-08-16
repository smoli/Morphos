---
id: c0098
title: Hostable bundle / export
status: backlog
epic: e14
depends: [c0097]
created: 2026-08-16
updated: 2026-08-16
tags: [hosting, bundle]
---

# Hostable bundle / export

Turn an app into a **self-contained `index.html`** that runs when served over
https: the standalone runtime (c0097) injected **in place of** the shell bridge,
under a hosting-appropriate CSP.

## What

An export that builds the app's bundled artifact with the c0097 runtime wired in
instead of the shell's `postMessage` bridge, and swaps the offline CSP
(`default-src 'none'`) for a **hosting policy** — still tight (no exfiltration),
but able to serve the app's own assets over https and run OPFS. Output is a
single `index.html` (plus any assets) ready to drop on a static host.

## Acceptance criteria

- [ ] The export produces a **self-contained `index.html`** with the c0097 runtime
      injected and the shell `postMessage` bridge **absent**.
- [ ] The **CSP** is replaced with a hosting-appropriate policy: the app runs and
      OPFS works over https, but it still cannot exfiltrate data (no open
      `connect-src`/`img-src` to arbitrary origins beyond what the app needs).
- [ ] A hosted copy of an fs-using app **runs and persists** data across reloads
      (manual/integration check against a local https server).
- [ ] Generated apps and the in-shell runtime are **unaffected** — this is an
      export path, not a change to how apps run inside Morphos.
- [ ] The injection/CSP-rewrite logic is **unit-tested** (pure string/DOM
      transform, like `injectBridge`).

## Notes

- Parallel to `core/appfs.injectBridge` + `core/bundle`; reuse the head-injection
  machinery (`insertIntoHead`). The exact hosting CSP is an epic open question —
  settle it here.

## Log

- 2026-08-16 created from the e14 epic breakdown (promoted from c0089)
