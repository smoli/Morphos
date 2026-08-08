---
id: c0034
title: Custom icons for apps
status: discuss
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T07:02:33
epic: e0002
---

## What

Let the user override an app's icon. The LLM's emoji stays the **default**, but
from a small per-app dialog the user can set the icon to a different **emoji** or
a chosen **image** (PNG/SVG, stored with the app). A user-set icon is remembered
and **never overwritten** by later generations, and shows everywhere the app is
represented — desktop tile, window title bar, dock, and chat context.

## Acceptance criteria

- [ ] An app's icon can be a single **emoji** (default, from the LLM) or a
      user-chosen **image**; the stored value distinguishes the two (an image is
      a `data:` URI).
- [ ] A per-app **dialog** lets the user set the icon — type/paste an emoji, or
      choose an image file — reachable from the desktop tile and an open window's
      title bar.
- [ ] A chosen image is stored **with the app** (data-URI in `app.json`),
      downscaled/size-capped so the manifest stays small and the app list stays
      fast (no extra file reads in `listApps`).
- [ ] A user-set icon is **persisted and never overwritten** by later
      generations; the LLM icon only fills an app that has no user override.
- [ ] The custom icon renders correctly **everywhere the app appears**: desktop
      tile, window title bar, dock item, and the chat context label (which must
      handle an image icon, not just an emoji string).
- [ ] Changing the icon works whether the app is **open or not**: it updates the
      app on disk and, if a window is open, its live state; the desktop list
      reflects the change.
- [ ] Resetting returns the app to its **default** (LLM emoji).
- [ ] Icon logic (emoji-vs-image detection, validation/size-capping of a chosen
      image) is covered by **unit tests**.

## Discussion

Decisions (interviewed 2026-08-08):

- **User override, emoji or image:** the LLM emoji is the default; the user can
  change it to another emoji or an image. Rejected LLM-generated richer icons for
  v1 (no user control) and image-only (loses the lightweight emoji default).
- **Edited via a per-app dialog** (not inline on the tile/title bar): a small
  rename/settings-style dialog, reachable from the tile and the window title bar.
- **User override wins forever:** once set, later generations never change it.
  Matches today's behavior (icon is derived only on the first generation) — make
  it explicit with a manifest flag so it stays true even if generation is ever
  changed to re-derive the icon.
- **Image stored as a data-URI in `app.json`**, size-capped/downscaled, so
  `listApps` keeps working straight from the manifest.

Open questions for planning:

- **Rename too?** The dialog is framed as rename/settings — include editing the
  app's display name (cheap: manifest `name`; id/folder stay unchanged), or keep
  v1 icon-only?
- **Commit on icon change?** `app.json` is git-tracked — commit it ("Icon
  geändert") or update the manifest without a version commit?
- **Image input & safety:** native picker for PNG/SVG + downscale; exact size
  cap; SVG rendered via `<img>` (script won't run) vs rasterizing to be safe.

## Log

- 2026-08-08 status → discuss (app)
