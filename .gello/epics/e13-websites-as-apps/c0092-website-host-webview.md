---
id: c0092
title: "Website host (<webview>)"
status: backlog
epic: e13
depends: [c0090]
created: 2026-08-16
updated: 2026-08-16
tags: [websites, sandbox]
---

# Website host (<webview>)

Render a website app's live URL inside its Morphos window using an Electron
**`<webview>`** — chosen because it lives in the DOM and so respects the
free-floating / overlapping / tiled windows for free (a native `WebContentsView`
would always paint on top and need bounds-syncing). Each website app gets its
**own persistent, isolated session** so logins survive restarts and sites can't
read each other's data.

## What

A renderer component that hosts a `type: website` app's `url` in an Electron
`<webview>`, slotted into the app window **in place of `AppCanvas`**. The webview
uses a **per-app persistent partition** (`persist:<app-id>` or equivalent), is
**sandboxed** with **no Node integration**, and is **not** given the generated-app
fs bridge (`injectBridge`) — a live site is untrusted third-party content and
stays isolated from Morphos and from the other apps.

## Acceptance criteria

- [ ] A `type: website` app opens with its `url` rendered in an Electron
      `<webview>` inside the normal app window; move/resize/tiling/z-order and the
      dock all work as for generated apps (DOM element, no bounds-syncing).
- [ ] The webview runs with **its own persistent partition per app**, so a login
      **survives an app close/reopen and an app restart**, and two website apps do
      **not** share cookies/localStorage.
- [ ] The webview is **sandboxed**, `nodeIntegration` off, `contextIsolation` on,
      and receives **none** of the generated-app fs/postMessage bridge.
- [ ] In-page navigation (following links within the site) works; load failures
      (bad host, offline) show a clear state rather than a blank window.
- [ ] Generated apps are unaffected — they still render through `AppCanvas`; the
      host is chosen by `type`.

## Notes

- New component beside `AppCanvas` (e.g. `WebsiteCanvas.vue`); `AppWindow` picks
  the host by `app.type`. Enable `<webview>` via `webPreferences.webviewTag`.
  Partition wiring/policy may need a small main-process `session.fromPartition`
  hook (permissions, no arbitrary downloads). The **storage location** of that
  partition is the unknown that c0096 (explorer view) will need to control — flag
  anything learned here for that card.

## Log

- 2026-08-16 created from the e13 epic breakdown
