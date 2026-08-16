---
id: c0100
title: GitHub Pages deploy
status: backlog
epic: e14
depends: [c0098]
created: 2026-08-16
updated: 2026-08-16
tags: [hosting, git, distribution]
order: 30
---

# GitHub Pages deploy

When an app has a GitHub remote, **publish the hostable bundle to GitHub Pages** —
build (c0098) + push to a Pages branch via the app's existing remote (reuse
c0082/c0083), so the app is one action away from a live URL.

## What

A per-app action, shown **only when the app has a GitHub remote**, that builds the
c0098 bundle and pushes it to a Pages branch (`gh-pages` or `/docs`) on `origin`,
then surfaces the resulting Pages URL. Uses **system git + the `gh` credential
helper** (the existing path). Pages **enablement** is handled within the "no API
key" stance — either flip it via `gh`, or push the branch and instruct the user.

## Acceptance criteria

- [ ] The action appears **only** when the app has a **GitHub remote**; otherwise
      only the portable export (c0099) is offered.
- [ ] It builds the c0098 bundle and pushes it to a **Pages branch** on `origin`
      using **system git + `gh`** (no new credential handling).
- [ ] **Pages enablement** is handled: either enabled via `gh`, or the user is
      given the exact step to turn it on — the card records which, per the "no API
      key" stance.
- [ ] The resulting **Pages URL** is surfaced to the user; failures surface a clear
      error and leave the repo unchanged.
- [ ] Pushing the bundle does not disturb the app's source history/branch
      (Pages content is a separate branch).

## Notes

- Reuses c0082/c0083 remote machinery (`ghCredentialArgs`, push). Decide branch
  convention (`gh-pages` vs `docs/`) and the enablement approach — the epic's open
  question. Depends on c0098 for the bundle; parallel to c0099.

## Log

- 2026-08-16 created from the e14 epic breakdown (promoted from c0089)
