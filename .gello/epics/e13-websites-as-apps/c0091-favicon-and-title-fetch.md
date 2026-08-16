---
id: c0091
title: Favicon + title fetch
status: backlog
epic: e13
depends: [c0090]
created: 2026-08-16
updated: 2026-08-16
tags: [websites, icon]
---

# Favicon + title fetch

Given a URL, get the page **title** (to seed the app name) and its **favicon** (to
become the app icon). Feeds the creation flow (c0094). Reuses the icon-as-file
infrastructure from c0077/c0078 so a website app's icon travels as a real file.

## What

A main-process helper that fetches a URL, extracts a sensible **title** and
resolves a **favicon** to the app icon. Favicon resolution handles the common
cases: `<link rel="icon">` (incl. relative hrefs resolved against the page),
`/favicon.ico` fallback, SVG and PNG/ICO, and a graceful fallback (a neutral icon
+ the host as name) when there is none or the fetch fails.

## Acceptance criteria

- [ ] From a URL, the helper returns a **title** (page `<title>`, falling back to
      the host) and a **favicon** resolved to the app-icon representation.
- [ ] `<link rel="icon"/"shortcut icon"/"apple-touch-icon">` is honoured, with
      **relative hrefs resolved** against the page URL; `/favicon.ico` is the
      fallback.
- [ ] **SVG** and raster (PNG/ICO) favicons are both supported; the icon is stored
      via the existing icon-as-file infra (c0077/c0078), not a bare `data:` URI.
- [ ] **No favicon / fetch failure / non-HTML** degrades cleanly to a neutral icon
      and the host as the name — never an error that blocks app creation.
- [ ] Network fetch is **confined to the user-supplied URL**; the resolution logic
      (pick best link, resolve relative, choose extension by MIME) is pure and
      **unit-tested**.

## Notes

- Pure resolution (parse links, rank candidates, relative→absolute, MIME→ext) in
  `core/*`; the actual HTTP fetch lives in the main process. Reuse c0077/c0078
  icon-file writing so the favicon becomes `icon.png`/`.svg` next to `app.json`.

## Log

- 2026-08-16 created from the e13 epic breakdown
