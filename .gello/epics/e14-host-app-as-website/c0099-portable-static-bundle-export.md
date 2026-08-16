---
id: c0099
title: Portable static-bundle export
status: backlog
epic: e14
depends: [c0098]
created: 2026-08-16
updated: 2026-08-16
tags: [hosting, distribution]
---

# Portable static-bundle export

Package the hostable bundle (c0098) as a **portable folder/zip** the user can drop
on **any** static host — no git required.

## What

A per-app action that writes the c0098 bundle (`index.html` + any assets) to a
folder (and/or a zip) the user chooses, ready to upload to any static web host.
Independent of the app's git remote — this is the host-agnostic deploy path.

## Acceptance criteria

- [ ] A per-app action exports the hostable bundle as a **folder** (and/or zip) to
      a user-chosen location.
- [ ] The exported artifact is **self-contained** — serving it over https from any
      static host runs the app (no Morphos, no git).
- [ ] The action is available for any app (no remote required); success/failure is
      reported (toast), and the export is confined to the chosen location.
- [ ] The bundle-writing/zipping is covered by tests where pure; the file write is
      a thin main-process step.

## Notes

- Reuses c0098 for the bundle itself; this card is packaging + a save location
  (like the readme/export file writes in the main process). Pairs with c0100
  (Pages) as the two deploy paths.

## Log

- 2026-08-16 created from the e14 epic breakdown (promoted from c0089)
