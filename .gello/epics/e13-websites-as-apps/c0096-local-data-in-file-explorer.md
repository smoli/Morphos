---
id: c0096
title: Local data in the file explorer
status: backlog
epic: e13
depends: [c0092, c0094]
created: 2026-08-16
updated: 2026-08-16
tags: [websites, file-explorer]
---

# Local data in the file explorer

The epic's **second goal** (deferred past the MVP): make each website app's local
browsing data — cookies, localStorage, cache — **visible in Morphos's file
explorer**, like any other app's data.

## What

Give each website app's session storage a home that Morphos's file explorer can
browse, and surface its **cookies / localStorage / site data** there. The hard
part is Electron's partition storage: partitions live under `userData` by default,
so this card must find a way to place (or mirror) a website app's data **inside
its app folder** — likely a small **spike** on `session.fromPartition` storage
paths / a custom `session` before committing an approach.

## Acceptance criteria

- [ ] A website app's **cookies and localStorage** (and cache/site data) are
      **browsable in Morphos's file explorer** under that app.
- [ ] The data is tied to the **per-app isolated partition** from c0092 (one app's
      data never shows under another).
- [ ] The chosen storage approach is documented (in-folder partition vs. surfacing
      Electron's default location), with the spike's finding recorded on the card.
- [ ] Browsing the data does **not** corrupt or lock the live session; safe while
      the app is open (read-only view is acceptable for a first cut).

## Notes

- Depends on the host + partition (c0092) and on having real website apps to look
  at (c0094). Start with the spike: can an Electron partition's storage path be
  set per app (into the app folder), or must the explorer point at
  `userData/Partitions/<id>`? That answer shapes the rest.

## Log

- 2026-08-16 created from the e13 epic breakdown
