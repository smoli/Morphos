---
id: c0088
title: Morphos stdio MCP server — write/edit + ask tools with path confinement
status: in-progress
created: 2026-08-13
updated: 2026-08-13
status-changed: 2026-08-13T16:32:02
epic: e07
---

# Morphos stdio MCP server — write/edit + ask tools with path confinement

The tool surface Morphos exposes to the `claude` agent during a generation run
(carved out of [[c0087]]). A stdio MCP server, launched by Morphos per run,
owns the **mutating** operations and the **Rückfrage** — so Morphos observes
every write and every question first-hand. Reads stay on the native CLI tools.

## Acceptance criteria

- [ ] A stdio MCP server ships with Morphos and is wired into the run via `--mcp-config` (strict — only Morphos' server is offered).
- [ ] Exposes a **write/edit** tool: create/replace a file and apply a targeted edit; delete/mkdir as the switchover needs.
- [ ] Exposes an **ask** tool: the agent poses exactly one Rückfrage; the call is surfaced to Morphos (which then commits nothing and opens the chat).
- [ ] Every write path is validated with `core/fsaccess: confineWithin` against the app folder and rejected unless it lands under `src/` or is one of the two root docs (concept, user doc). `..` and absolute paths cannot escape.
- [ ] The server records which files it wrote in a run, so Morphos knows whether to commit (≥1 write) and can re-read exactly what changed.
- [ ] Pure logic is unit-tested: confinement (reject outside `src/`, reject `..`), write/edit semantics, ask surfacing. No live agent needed for these.

## Notes

- Enforcement point for the "hard confinement" decision in [[c0087]] — the
  server *is* the sandbox boundary, so no PreToolUse hook is needed.
- Open: exact tool granularity (one write tool vs. separate edit/replace/
  delete/mkdir), and whether apps ever need deletes/renames under `src/`.

## Log

- 2026-08-13 status → ready (app)
- 2026-08-13 status → in-progress (agent)
