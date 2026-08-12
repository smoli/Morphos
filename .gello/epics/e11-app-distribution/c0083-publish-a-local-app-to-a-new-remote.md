---
id: c0083
title: Publish a local app to a new remote
status: inbox
created: 2026-08-12
epic: e11
depends: [c0082]
tags: [git, distribution]
---

# Publish a local app to a new remote

A locally-created app has **no `origin`** — so it can't be shared. Give it a
first-time **publish**: the user provides a remote URL (a repo they created),
Morphos adds it as `origin` and pushes the app's history. After that, the app is
an ordinary remote-tracking app and c0082's push/pull applies.

## What

A per-app action „App veröffentlichen…" (shown when the app has **no** remote)
that prompts for a **remote URL**, sets it as `origin`, and does the **initial
push** of the app's branch/history. Morphos does **not** create the remote repo
(no GitHub API / no API-key stance) — the user creates an empty repo first and
pastes its URL.

## Acceptance criteria

- [ ] A per-app action **„App veröffentlichen…"** appears **only when the app has
      no `origin`**; once published, it's replaced by c0082's Push/Pull.
- [ ] The user supplies the **remote URL**; Morphos sets it as `origin` and does
      the **initial push** of the default branch (setting upstream).
- [ ] Uses **system git + the `gh` credential helper** (like clone/push);
      auth/network failures surface a clear error and **leave `origin` unset** if
      the first push fails (no half-published state).
- [ ] Morphos **does not create** the remote repo; the message makes clear the
      user must create an (ideally empty) repo first. Pushing to a **non-empty**
      remote is refused cleanly (that's c0082/c0084 territory).
- [ ] The URL comes from the **user**, not app content; the operation is confined
      to the app's own repo.

## Discussion

- Split out of **c0082**: that card assumes an existing `origin`; this one creates
  it. Together they cover the full share loop (publish → push/pull → import).
- Open: how much to help with a **missing/non-empty remote** — just a clear error,
  or guidance? Creating the remote via `gh repo create` was considered but
  rejected for now (keeps the no-API-key stance; the user owns the remote).

## Log

- 2026-08-12 created (split from c0082)
