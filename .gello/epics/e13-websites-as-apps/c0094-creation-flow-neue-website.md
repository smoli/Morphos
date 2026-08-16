---
id: c0094
title: "Creation flow „Neue Website…“"
status: backlog
epic: e13
depends: [c0090, c0091, c0092]
created: 2026-08-16
updated: 2026-08-16
tags: [websites, ui]
---

# Creation flow „Neue Website…“

The entry point: a desktop action that turns a URL into a website app. Prompts
for a URL, fetches its title + favicon (c0091), creates a `type: website` app
(c0090) and opens it in the host (c0092).

## What

A desktop launcher action **„Neue Website…“** (beside „Neue App“ / the dock ＋)
prompts for a **URL**, validates it, fetches the page **title** and **favicon**
(c0091), and creates a `type: website` app folder — `app.json` with `type:
'website'`, the `url`, the favicon as icon, the title as name. The desktop list
refreshes and the new app opens.

## Acceptance criteria

- [ ] A desktop action **„Neue Website…“** prompts for a URL and starts creation;
      an invalid/empty URL is rejected with a clear message.
- [ ] On confirm, a `type: website` app is created (`app.json` = `type`, `url`,
      favicon icon, title-derived name) in the workspace's apps folder.
- [ ] Title and favicon come from **c0091**; a fetch miss falls back gracefully
      (host as name, neutral icon) without blocking creation.
- [ ] The desktop **refreshes** so the new tile appears, and **opening it** renders
      the live site via the host (c0092).
- [ ] The URL comes from the **user** (not app content); creation is confined to
      the workspace; cancel/failure leaves the workspace unchanged.

## Notes

- Mirrors the „App aus Git laden…“ pattern (c0074): renderer prompts, a
  main-process handler (e.g. `morphos:createWebsiteApp`) does fetch → write →
  return the summary. Reuses `core/app` (`makeAppId`) for the id and the c0091
  helper for title/favicon.

## Log

- 2026-08-16 created from the e13 epic breakdown
