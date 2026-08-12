---
id: c0084
title: "Resolve diverged app sync (keep mine / take theirs)"
status: inbox
created: 2026-08-12
epic: e11
depends: [c0082]
tags: [git, distribution]
---

# Resolve diverged app sync (keep mine / take theirs)

c0082 keeps sync **fast-forward only**: when local and remote have **both**
advanced, it detects the divergence and stops. This card adds the resolution —
at the **whole-app** level, never a per-file merge, because Morphos versions are
full LLM-generated snapshots.

## What

When a push/pull hits divergence, offer the user a **whole-side choice** rather
than a git merge:

- **Meine behalten** — keep the local state, overwrite the remote (an explicit,
  confirmed non-fast-forward push / force-with-lease).
- **Ihre nehmen** — take the remote state, recorded locally as a new **linear
  commit** (reuse `restoreVersion` semantics) so nothing is silently lost.
- **Abbrechen** — leave both sides untouched.

No conflict markers ever land in generated source.

## Acceptance criteria

- [ ] On divergence, the user is offered **keep-mine / take-theirs / cancel**;
      cancel leaves local and remote unchanged.
- [ ] **Take-theirs** brings the remote state into the app as a **new linear
      commit** (no history rewrite), then the app **reloads** if open.
- [ ] **Keep-mine** overwrites the remote only after an **explicit confirmation**
      (destructive); uses `--force-with-lease`, never a blind force.
- [ ] Refused while an agent is **generating** for that app; failures leave the
      repo unchanged.
- [ ] The side-selection + resulting git state covered by **unit tests**.

## Discussion

- Split out of **c0082** (which detects but doesn't resolve divergence).
- Whole-side resolution is chosen over git merge/rebase because a 3-way merge of
  generated snapshots is meaningless.
- Open: whether to show a **diff/preview** of the two sides before choosing, or
  just the two versions' messages/timestamps.

## Log

- 2026-08-12 created (split from c0082)
