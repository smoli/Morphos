---
id: c0095
title: Website-app chrome gating
status: backlog
epic: e13
depends: [c0090, c0092]
created: 2026-08-16
updated: 2026-08-16
tags: [websites, ui]
---

# Website-app chrome gating

A website app is a **distinct, minimal kind**: none of the generated-app
affordances apply. Hide/disable them so the window is just the site (plus its nav
bar), not a half-populated app shell.

## What

For `type: website` apps, branch the window/desktop chrome so the features that
only make sense for generated apps are gone: the **chat dock** (💬 / the toggle),
**versions**, and the **README / publish / push-pull** menu entries (e11).
Generated apps keep everything; the split is driven by `type` (c0090).

## Acceptance criteria

- [ ] For a `type: website` app the **chat dock and its toggle** are absent (no 💬
      in the title bar, no shortcut opening it).
- [ ] **Versions** UI is not offered for website apps.
- [ ] The app-tile / window menus **omit** README (c0077), publish (c0083) and
      push/pull (c0082) for website apps.
- [ ] **Generated apps are unchanged** — every affordance still present.
- [ ] The gating keys off `app.type`, with a component/store test asserting the
      website tile/window hides the above and the generated one does not.

## Notes

- Touches the app window title bar, the dock/chat toggle, and the tile context
  menu (`DesktopView`). Keep the checks in one place (a `isWebsiteApp(app)` /
  capability helper) so future kinds are easy.

## Log

- 2026-08-16 created from the e13 epic breakdown
