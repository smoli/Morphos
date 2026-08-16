---
id: c0093
title: Website nav bar
status: backlog
epic: e13
depends: [c0092]
created: 2026-08-16
updated: 2026-08-16
tags: [websites, ui]
---

# Website nav bar

A small navigation strip over the website host: **back / forward / reload** and
the **current URL** shown. The app's identity stays pinned to its saved `url`;
the nav bar just makes the live page usable.

## What

Add a compact nav bar to the website host (c0092): back, forward, reload, and a
read-only display of the current URL (updates as the user navigates within the
site). Back/forward reflect the webview's history (disabled when unavailable).
The saved app `url` is unchanged by navigation — it remains the app's home.

## Acceptance criteria

- [ ] The website host shows a nav bar with **back**, **forward**, **reload** and
      the **current URL**.
- [ ] Back/forward drive the webview's history and are **disabled** when there's
      nowhere to go; reload reloads the current page.
- [ ] The current-URL display **updates on in-page navigation**; the app's saved
      `url` (its home/identity) is **not** rewritten by browsing.
- [ ] The bar fits the existing window chrome and doesn't appear for generated
      apps.

## Notes

- Pure-ish UI over the c0092 webview API (`goBack`/`goForward`/`reload`/
  `canGoBack`/`getURL`, `did-navigate` events). Open question carried from the
  epic: whether an explicit **"home"** (back to the saved `url`) is worth adding —
  decide here or defer.

## Log

- 2026-08-16 created from the e13 epic breakdown
