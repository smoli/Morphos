---
id: c0049
title: "File-Explorer: content previews"
status: in-progress
epic: e09
depends: [c0048]
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T07:12:30
---

## What

Preview the selected file's content — rich preview for passive types, and
**sandboxed** rendering for active HTML/SVG, so untrusted files never execute in
the trusted renderer.

## Acceptance criteria

- [ ] Passive types preview richly: **images**, **video**, **audio**, **markdown**
      (escape-first `core/markdown`), **JSON** (pretty-printed + syntax-
      highlighted), **text**.
- [ ] **HTML/SVG** preview inside a **sandboxed iframe** (allow-scripts, no
      same-origin, CSP) — the same isolation as generated apps (AppCanvas pattern).
- [ ] Large/binary media load via a **scoped stream** (custom protocol or blob),
      not by inlining the whole file; oversized text/JSON is capped with a notice.
- [ ] Unknown/unpreviewable types show file info (name, size, type) without
      attempting to render.
- [ ] Preview type-detection and the JSON/text formatting (pure) are covered by
      unit tests; the HTML sandbox + escaping by component tests.

## Notes

- Which media formats are guaranteed (mp4 / webm, …) and the exact preview size
  caps are decided here.

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
