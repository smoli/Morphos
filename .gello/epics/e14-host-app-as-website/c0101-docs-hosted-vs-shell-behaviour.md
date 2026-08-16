---
id: c0101
title: "Docs: hosted-vs-shell behaviour"
status: backlog
epic: e14
depends: [c0099, c0100]
created: 2026-08-16
updated: 2026-08-16
tags: [hosting, docs]
---

# Docs: hosted-vs-shell behaviour

Document, for the user, how a **hosted** app differs from the same app **inside
Morphos**, and the limits of the publish-to-web flow — so surprises (data living
in a browser sandbox, `file://` not working) are expected, not bugs.

## What

User-facing documentation covering the differences and limits: the hosted fs is a
**per-origin virtual sandbox** (OPFS/IndexedDB), not the granted real folder;
**`file://` is unsupported** (needs an https host); data is scoped to the host
**origin** (OPFS namespacing when several apps share one host); and how the two
deploy paths (portable bundle c0099, GitHub Pages c0100) are used.

## Acceptance criteria

- [ ] Docs state that hosted apps use a **sandboxed virtual fs** (per-origin,
      persists in the browser) — distinct from the shell's granted folder — and
      that data does **not** travel between the two.
- [ ] Docs state **`file://` is out of scope** and why (secure context / OPFS).
- [ ] Docs explain the **two deploy paths** (portable bundle, GitHub Pages) and
      when each applies.
- [ ] Docs note **OPFS namespacing** on shared origins (one site per repo is
      clean; a shared host needs care).
- [ ] The docs live where the project keeps user docs and are linked from the
      relevant export/publish actions.

## Notes

- Written once both deploy paths exist (c0099, c0100). Keep it short and practical
  — the behaviour is settled by c0097/c0098; this just makes it discoverable.

## Log

- 2026-08-16 created from the e14 epic breakdown (promoted from c0089)
