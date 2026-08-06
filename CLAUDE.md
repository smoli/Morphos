# CLAUDE.md

<!-- gello-convention -->
## Working the gello board

This project uses **gello** — a Markdown-native Kanban board in `.gello/`.
The files are the single source of truth; cards are `.md` files with YAML
frontmatter. Read `.gello/concept.md` for the product spec.

- **Query the board** (never read all cards to find one):
  ```bash
  grep -rl "^status: ready" .gello/cards .gello/epics --include="[ci][0-9]*.md"
  grep -rh "^status:" .gello/cards .gello/epics --include="[ci][0-9]*.md" | sort | uniq -c
  ```
- **Pick up work**: re-query the board from disk first, then take the
  top `ready` card whose `depends` are all `done`; set
  `status: in-progress` before starting.
- **Finish**: set `status: review` (only a human moves cards to `done`).
- **New ideas**: capture a card in `.gello/cards/` with `status: inbox` — a
  heading and a sentence. (Inbox is a status, the first column — not a folder.)
- **Triage**: move a card into an epic (`epics/eNN-name/`) or leave it
  standalone in `.gello/cards/`; `tags:` are the separate cross-cutting axis.
- **Archive**: long-done cards can be archived into an `archive/` folder in
  their own home; they keep their id and epic. Add `--exclude-dir=archive` to
  a board query to leave them out.
- Valid statuses come from `board.yaml`; frontmatter must be valid YAML.

### Card structure

Each card is one `.md` file whose name is its id: `cNNNN.md` for tasks,
`iNNNN.md` for issues — a **four-digit, zero-padded** number (`c0001`,
`c0014`, …). Ids are unique board-wide, not per-epic. Cards live either
standalone in `.gello/cards/` or inside an epic folder `epics/eNNNN-slug/`.

An epic folder additionally holds an `epic.md` (its own frontmatter carries
`id: eNNNN`, `type: epic`, `title:`, `status:`) — it describes the epic and is
**not** a card, so the `[ci][0-9]*.md` board queries skip it.

A card is YAML frontmatter followed by a `# Title` heading and a short body:

```markdown
---
id: c0014                 # matches the filename; four digits, zero-padded
epic: e0004-chat-dialog   # omit for a standalone card in .gello/cards/
title: "Aufklappbarer Chat mit Verlauf (ChatDock)"   # quote if it has a colon
status: done              # one of board.yaml's columns
tags: [chat, ui]          # cross-cutting axis, independent of the epic
depends: [c0004]          # ids that must be `done` before this is `ready`
created: 2026-07-03       # ISO date
commit: df0cf77           # optional: the commit that implemented it
---

# Aufklappbarer Chat mit Verlauf (ChatDock)

One or two sentences describing the card.
```

`id`, `title`, and `status` are required; `epic`, `tags`, `depends`,
`created`, and `commit` are optional. Keep the `# Title` in the body in sync
with the `title:` field.
