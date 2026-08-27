---
id: c0119
title: "Asset-manager panel — add / remove / preview"
status: ready
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:29:08
order: 40
---

# Asset-manager panel — add / remove / preview

## What

The user-facing surface for managing an app's assets: a shell panel that lists
the app's `assets/` (name, type, size), adds files (file picker and/or
drag-drop) by copying them into `assets/` through the c0116 storage ops,
previews the selected asset, and removes one. Removing an asset that code still
references degrades gracefully (the broken reference is left as-is, no crash).

## Acceptance criteria

- [ ] A panel lists the app's assets with name, type and size.
- [ ] Adding via a file picker copies the chosen file(s) into `assets/`.
- [ ] Drag-and-drop of files onto the panel/app adds them to `assets/`.
- [ ] Selecting an asset previews it (image preview; a sensible generic view for
      fonts/data).
- [ ] Removing an asset deletes it; removing one still referenced by code does
      not crash the app or the shell.
- [ ] Specs cover list, add (picker and drop), preview and remove.

## Notes

Depends on the c0116 storage model/ops. New UI (the existing `ExplorerPanel`
shows the runtime data folder, not app source). Follow the shell's existing
panel and drag-drop patterns. **No size cap in v1** — do not reject files by
size at add time (decided 2026-08-27).

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
