---
id: c0034
title: Custom icons for apps
status: done
created: 2026-08-08
updated: 2026-08-08
status-changed: 2026-08-08T23:18:37
epic: e0002
commit: 5c9dd16
usage-tokens: 65435
usage-cost: 11.080418
---

## What

Let the user override an app's icon. The LLM's emoji stays the **default**, but
from a small per-app dialog the user can set the icon to a different **emoji** or
a chosen **image** (PNG/SVG, stored with the app). A user-set icon is remembered
and **never overwritten** by later generations, and shows everywhere the app is
represented — desktop tile, window title bar, dock, and chat context.

## Acceptance criteria

- [x] An app's icon can be a single **emoji** (default, from the LLM) or a
      user-chosen **image**; the stored value distinguishes the two (an image is
      a `data:` URI).
- [x] A per-app **dialog** lets the user set the icon — type/paste an emoji, or
      choose an image file — reachable from the desktop tile and an open window's
      title bar.
- [x] A chosen image is stored **with the app** (data-URI in `app.json`),
      downscaled/size-capped so the manifest stays small and the app list stays
      fast (no extra file reads in `listApps`).
- [x] A user-set icon is **persisted and never overwritten** by later
      generations; the LLM icon only fills an app that has no user override.
- [x] The custom icon renders correctly **everywhere the app appears**: desktop
      tile, window title bar, dock item, and the chat context label (which must
      handle an image icon, not just an emoji string).
- [x] Changing the icon works whether the app is **open or not**: it updates the
      app on disk and, if a window is open, its live state; the desktop list
      reflects the change.
- [x] Resetting returns the app to its **default** (LLM emoji).
- [x] Icon logic (emoji-vs-image detection, validation/size-capping of a chosen
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

The three open questions, decided while implementing (say so if you want any of
them the other way — each is a small change):

- **Rename too? → no, icon-only.** The acceptance criteria are icon-only, so
  that is the delivered scope. The dialog is `IconDialog` (not a general
  rename/settings dialog); adding a name field later is a small addition.
- **Commit on icon change? → yes, one commit.** `app.json` is git-tracked;
  leaving it uncommitted would keep the app's working tree dirty and the change
  would silently ride along in the next generation's commit. The message is
  „Icon geändert“ bzw. „Icon zurückgesetzt“. `updatedAt` is deliberately *not*
  touched — a new icon should not reorder the desktop tiles.
- **Image input & safety: → rasterize everything.** The dialog takes PNG, JPEG,
  GIF, WebP *and* SVG via an `<input type="file">` (Electron shows the native
  picker), then draws it onto a canvas and stores a PNG. That answers the SVG
  question outright: what is stored is pixels, never a document. Cap: longest
  edge 128 px, ≤ 64 KB — if a dense image still exceeds it at 128 px, the dialog
  retries at 96 and 64 px before refusing.

## Notes (implementation)

- `src/core/icon.ts` — the framework-independent rules (emoji-vs-image
  detection, single-grapheme normalisation incl. ZWJ/skin-tone/flag, target
  size, data-URI validation and size cap). Fully unit-tested; the **main
  process validates again** via the same `validateIcon`, it does not trust the
  renderer alone.
- Manifest flag `iconCustom` in `app.json` (`AppMeta`). It survives `saveApp`,
  `touchManifest` (revert) and the legacy migration, so a user icon really is
  never overwritten. `applyGeneratedIcon()` in the app store is the single place
  where an LLM icon is taken over — and it returns early when `iconCustom`.
- New host call `setAppIcon(folder, id, icon | null)` → `setManifestIcon()`
  writes only the manifest and commits. It never loads the app, which is why it
  works for a closed app just as well as an open one. `null` resets: the default
  is re-derived from `<meta name="morphos:icon">` in the bundled `index.html`.
- `useSetAppIcon()` is the one entry point that fans the change out everywhere:
  disk → desktop tile → open window(s) title bar/dock → the window's own state.
- `AppIcon.vue` renders emoji-or-image and is now used at every place an app
  icon appears; the chat context label therefore takes the icon as its own prop
  instead of gluing it into the label string.
- Known, accepted edge: if an icon is changed for a *closed* app while a
  background agent run for that same app is in flight, that run's `saveApp` can
  overwrite the icon (its state was read before the change). Rare, and reverting
  it is one more icon change.

## Log

- 2026-08-08 status → discuss (app)
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 status → review (agent)
- 2026-08-08 status → done (app)
