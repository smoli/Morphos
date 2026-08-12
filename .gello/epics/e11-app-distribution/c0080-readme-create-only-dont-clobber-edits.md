---
id: c0080
title: "Readme: create-only, don't clobber hand-edits"
status: ready
created: 2026-08-12
epic: e11
depends: [c0077]
tags: [readme, git]
status-changed: 2026-08-12T22:47:11
order: 10
updated: 2026-08-12
---

# Readme: create-only, don't clobber hand-edits

The „Readme erstellen" action (c0077) **rewrites `README.md` on every run**
(idempotent overwrite). That silently discards any hand-edits: someone who
tweaks the generated README and re-triggers the action loses their changes.
Make README generation **create-only** — write only when `README.md` is absent,
and otherwise leave the existing file untouched.

## What

Change the readme flow so an existing `README.md` is never overwritten. When one
is already present, the action reports that (toast) instead of rewriting. This
matches the discussion decision for c0077 (*create-only, don't clobber edits*),
which the shipped implementation diverged from.

## Acceptance criteria

- [ ] Running „Readme erstellen" when **no `README.md` exists** writes it as
      today (unchanged behaviour).
- [ ] Running it when a `README.md` **already exists** leaves the file
      **byte-for-byte untouched** and reports "README exists already" via toast —
      no commit is made.
- [ ] Any accompanying **icon asset** is only written on first creation; an
      existing README run touches neither the README nor the icon file.
- [ ] Covered by unit tests (`readme.spec`): create-when-absent, skip-when-present
      (no write, no commit), and the store/menu action's "already exists" result.

## Discussion

- Open question: keep a way to **explicitly regenerate/overwrite** (e.g. a
  separate „Readme neu erstellen" or a confirm) for when the author *does* want
  the fresh template back — or leave that until an export flow needs it. The
  c0077 discussion deferred an explicit overwrite option.

## Log

- 2026-08-12 created (follow-up from c0077 discussion)
- 2026-08-12 status → ready (app)
