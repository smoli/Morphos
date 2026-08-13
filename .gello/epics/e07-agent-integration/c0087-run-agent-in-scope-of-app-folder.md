---
id: c0087
title: Run agent in scope of app folder
status: in-progress
created: 2026-08-13
updated: 2026-08-13
status-changed: 2026-08-13T19:09:49
epic: e07
depends: [c0088]
---

## What

Switch the generation engine from the text-block protocol
(`===MORPHOS:FILE===` / `MORPHOS:SAY`, parsed out of the agent's output) to
**the agent editing the app's files directly on disk**. The `claude`
subprocess runs with the app folder (`appDir(folder, id)`) as its CWD. Morphos
exposes its own **stdio MCP server** for the mutating operations and the
Rückfrage; reads stay on the native CLI tools. After a run, Morphos reads the
result back from disk, bundles the artefact, and commits.

## Acceptance criteria

- [ ] `runClaude` spawns `claude` with `cwd` = the app folder; Read/Glob/Grep resolve against that app.
- [ ] `morphos:generate` receives the app `folder` + `id` (or resolves `appDir`); the main process works on the on-disk app, not on in-memory files from the payload.
- [ ] The app is materialised on disk (git-backed folder) before the run — disk is the single source of truth for the agent.
- [ ] Morphos launches a **stdio MCP server** for the run exposing a **write/edit** tool (create/replace + targeted edit; delete as needed) and an **ask** tool (Rückfrage).
- [ ] The MCP write tool confines every path via `core/fsaccess: confineWithin` and rejects anything outside `src/` and the two root docs (concept, user doc).
- [ ] Native **Write/Edit are disabled**; `--allowedTools` permits only the MCP write/ask tools plus native **Read/Glob/Grep** (and `Read(<image>)` for attachments).
- [ ] Calling **ask** marks the run a pure Rückfrage: nothing committed, chat opens with the question — no output-marker parsing.
- [ ] After a run that wrote files, Morphos re-reads `src/` + docs from disk, bundles, and makes **one commit** (message = the user's wish). A run with only `ask` / no writes produces no commit.
- [ ] The agent's final assistant message is surfaced in chat as the Mitteilung.
- [ ] Old machinery retired: `parseLLMOutput` / `applyChanges` / `splitDocs`, `serializeFiles`-into-prompt, and the `MORPHOS:*` markers (incl. the streaming markers in `core/agent.ts`) are removed or reduced to what the new path still needs.
- [ ] Concurrency: two runs never target the same app folder at once (per-app serialisation).
- [ ] Tests cover cwd wiring, MCP write confinement (reject `..` / outside `src/`), ask ⇒ no-commit, write ⇒ commit + re-read + bundle.

## Discussion

**Decisions (2026-08-13):**
- **Full switchover** in this card — the block protocol is dead the moment the agent edits on disk, so it is not kept on life support.
- **Disk is the source of truth.** Each app is already its own git repo; the renderer stops shipping file contents into `morphos:generate`, and the shell reads/writes/commits the folder.
- **Confinement is hard.** Path validation lives in the MCP write tool (`confineWithin`) — the agent physically cannot escape the app folder, matching Morphos' sandbox/CSP posture.
- **Rückfrage + writes via a Morphos stdio MCP server; reads native.** Because Morphos owns the write and ask tools, it observes every mutation and every question first-hand — no git-diff guessing, no output-marker parsing. Read/Glob/Grep stay native for speed.

**Rejected alternatives:**
- A PreToolUse hook guarding native Write/Edit — superseded by the MCP server owning writes (the server *is* the enforcement point).
- Inferring "question vs. work" from a git diff, or keeping a `MORPHOS:SAY` marker — replaced by the explicit MCP `ask` tool.

**Open questions:**
- Exact write-tool surface: one write-file tool vs. separate edit/replace/delete/mkdir — and whether an app legitimately needs deletes/renames under `src/`.
- Whether the MCP server deserves its own child card (largest chunk of the switchover).
- Commit trigger: commit whenever the server recorded ≥1 write, or diff the tree as a backstop?
- How much of `core/files` / `core/agent.ts` survives — the streaming UI still needs some mapping from CLI tool-use events to chat progress.

## Log

- 2026-08-13 status → ready (app)
- 2026-08-13 status → discuss (app)
- 2026-08-13 discussed → backlog; moved e0001 → e07; split out [[c0088]] (depends)
- 2026-08-13 status → ready (app)
- 2026-08-13 status → in-progress (agent)
