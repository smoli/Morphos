---
id: e13
title: Websites as Apps
status: backlog
---

## Goal

Save websites as apps. Given an URL show the website as an app. Use Favicon as icon.

Make local data, like cookies, local storage, etc. visible in the file explorer of morphos

## Definition of done

A URL can be saved as a first-class **website app**: it opens in a normal
Morphos window (favicon as icon, small nav bar), keeps its login across restarts
via a per-app isolated session, and stays a *distinct minimal kind* — no chat,
versions, README or e11 sharing. Each site's local data (cookies, localStorage)
is browsable in Morphos's file explorer.

## Plan (steps + dependencies)

Decisions (planned 2026-08-15): website apps are a **new app kind**, hosted in an
Electron **`<webview>`** (fits the free-floating/overlapping/tiled DOM windows),
with a **per-app isolated & persistent** partition. MVP = live site + favicon +
small nav bar (steps 1–6). The file-explorer data view (the epic's second goal)
is **deferred** to step 7. Website apps skip the whole generation pipeline
(no src/, no LLM chat, no versions/README/push-pull).

1. **App model — `type: website`** — extend the manifest with a `type`
   (`generated` default | `website`) and a `url` for website apps; migrate
   existing apps to `generated`; validate. Pure/core, unit-tested. *(root)*
2. **Favicon + title fetch** — main-process helper: from a URL, get the page
   **title** and **favicon**, resolving the favicon to the app icon (reuse the
   icon-as-file infra from c0077/c0078); handle missing / relative / SVG favicons
   and network failure. (← step 1)
3. **Website host (`<webview>`)** — a renderer component that renders a website
   app's URL in an Electron `<webview>` with its **own persistent isolated
   partition**, slotted into the app window in place of `AppCanvas`; sandboxed,
   no Node integration, and **not** given the generated-app fs bridge. (← step 1)
4. **Website nav bar** — small chrome over the host: **back / forward / reload**
   and the current URL; identity stays pinned to the saved URL. (← step 3)
5. **Creation flow „Neue Website…"** — a desktop action that prompts for a URL,
   validates it, fetches title + favicon (step 2), creates a `type: website` app
   (app.json with `url` + favicon icon), refreshes the desktop and opens it.
   (← step 1, step 2, step 3)
6. **Website-app chrome gating** — for `type: website` apps, hide/disable the
   affordances that don't apply: chat dock, versions, README/publish/push-pull
   menu entries — enforcing the "distinct minimal kind". (← step 1, step 3)
7. **Local data in the file explorer** *(deferred goal)* — place each website
   app's session storage where Morphos's file explorer can browse it, and surface
   its cookies / localStorage / site data there. Electron partition-path handling
   is the tricky part — likely a spike within this card. (← step 3, step 5)

Open questions:

- **External-origin links** — open in the same webview, in a new website app, or
  hand off to the system browser? (step 3/4)
- **Whether website apps are git repos** like generated apps (trivial history of
  `app.json` + favicon) or skip git — leaning: reuse the folder/git model, decide
  at step 1.
- **Partition storage location** for step 7 — Electron stores partitions under
  `userData`; relocating per-app into the app folder is the unknown to spike.
