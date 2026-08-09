---
id: c0051
title: Show file size and creation/change date
status: in-progress
ref: c0048
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T07:40:25
---

## What

The explorer listing (c0048) shows only names. Give every entry its **size** and
its **dates** — created and changed — as sortable columns, and show the same
figures in the preview header of the selected file.

## Acceptance criteria

- [ ] The listing shows, per entry, **size** (human readable; folders have none)
      and the **changed** and **created** dates; unknown values read as „—“
      rather than „0 B“ / „1.1.1970“.
- [ ] The scoped `list` operation carries size and both timestamps, taken
      **without following symlinks** (a link inside the folder describes itself,
      not its target).
- [ ] The columns are **sortable**: clicking a column head sorts by it, clicking
      it again reverses; folders stay above files in every order.
- [ ] The selected file's **preview header** shows size, changed and created.
- [ ] Sorting and formatting rules are pure and unit-tested; that `list` really
      delivers the figures is covered in `core/fsaccess`, the columns in the
      component test.

## Log

- 2026-08-09 status → in-progress (agent)
