---
id: c0088
title: Morphos stdio MCP server — write/edit + ask tools with path confinement
status: review
created: 2026-08-13
updated: 2026-08-13
status-changed: 2026-08-13T16:44:33
epic: e07
usage-tokens: 50179
usage-cost: 4.426146
---

# Morphos stdio MCP server — write/edit + ask tools with path confinement

The tool surface Morphos exposes to the `claude` agent during a generation run
(carved out of [[c0087]]). A stdio MCP server, launched by Morphos per run,
owns the **mutating** operations and the **Rückfrage** — so Morphos observes
every write and every question first-hand. Reads stay on the native CLI tools.

## Acceptance criteria

- [x] A stdio MCP server ships with Morphos and is wired into the run via `--mcp-config` (strict — only Morphos' server is offered).
- [x] Exposes a **write/edit** tool: create/replace a file and apply a targeted edit; delete/mkdir as the switchover needs.
- [x] Exposes an **ask** tool: the agent poses exactly one Rückfrage; the call is surfaced to Morphos (which then commits nothing and opens the chat).
- [x] Every write path is validated with `core/fsaccess: confineWithin` against the app folder and rejected unless it lands under `src/` or is one of the two root docs (concept, user doc). `..` and absolute paths cannot escape.
- [x] The server records which files it wrote in a run, so Morphos knows whether to commit (≥1 write) and can re-read exactly what changed.
- [x] Pure logic is unit-tested: confinement (reject outside `src/`, reject `..`), write/edit semantics, ask surfacing. No live agent needed for these.

## Notes

- Enforcement point for the "hard confinement" decision in [[c0087]] — the
  server *is* the sandbox boundary, so no PreToolUse hook is needed.

**Was entstanden ist**

- `src/core/mcp.ts` — die ganze Logik: MCP-Protokoll (JSON-RPC über stdio, ohne
  SDK — der Server spricht `initialize`/`tools/list`/`tools/call`/`ping` selbst),
  die vier Werkzeuge, die Pfad-Grenze und das Lauf-Protokoll. 47 Tests.
- `electron/mcp-server.ts` — nur die Hülle: App-Ordner und Protokolldatei aus der
  Umgebung, stdin rein, stdout raus. Wird von `vite.config.ts` als zweiter
  Einstieg nach `dist-electron/mcp-server.js` gebaut und dort von der Claude CLI
  als eigener Prozess gestartet (`mcpLaunch`: eigenes Programm + `ELECTRON_RUN_AS_NODE`,
  also ohne installiertes Node beim Anwender).

**Entscheidungen zu den offenen Fragen der Karte**

- Werkzeugschnitt: `write` (anlegen/ersetzen), `edit` (eine eindeutige Textstelle,
  optional `replace_all`), `delete`, `ask`. **Kein mkdir** — `write` legt fehlende
  Ordner mit an, und leere Ordner tragen in einer gebündelten App nichts.
  **Kein rename** — Umbenennen ist `write` + `delete`, und das steht so auch im
  Lauf-Protokoll.
- `delete` betrifft nur Quelldateien unter `src/`: Die beiden Dokumente gehören
  zur App und verschwinden nie (wie bisher schon in `core/files`).
- Grenze zweistufig: erst lexikalisch (`confineWithin` + `isValidOutputPath` —
  rein, ohne Platte, darum voll testbar), dann real aufgelöst (`resolveWithin`),
  damit auch kein Symlink im App-Ordner hinausführt.
- Ein Journal-Schreibfehler wird als Werkzeugfehler zurückgemeldet, statt still
  zu bleiben: Ohne Protokoll wüsste Morphos hinterher nicht, ob committet wird.

**Abgrenzung zu [[c0087]]**

Die Aufrufteile für die CLI sind hier gebaut und getestet (`agentMcpArgs`:
`--mcp-config <json> --strict-mcp-config` plus eine Freigabe, die nur
`mcp__morphos__*` sowie Read/Glob/Grep kennt — Write/Edit/Bash sind nicht dabei).
Die **Aufrufstelle** selbst (`runClaude` mit dem App-Ordner, Journal anlegen und
nach dem Lauf auslesen, Commit-Entscheidung, Prompt-Umstellung) gehört zu
[[c0087]]; `core/mcp` hält dafür `mcpLaunch`, `parseRunLog` und `wroteSomething`
bereit.

**Geprüft**

- `npx vitest run src/core/mcp.spec.ts` → 47 grün; `npx vue-tsc --noEmit` → sauber.
- `npx vite build` → `dist-electron/mcp-server.js` entsteht neben `main.js`.
- Rauchprobe mit dem gebauten Server (echter Prozess, echtes stdio): initialize →
  tools/list → `write src/index.html` (angelegt) → `write ../escape.txt`
  (abgewiesen) → `ask` (notiert), Journal wie erwartet.
- Die volle Suite hat 19 rote Tests, alle unabhängig von dieser Karte:
  Symlink-Tests (`EPERM` — dieser Windows-Rechner darf keine Symlinks anlegen),
  `findGh`/git-Proben aus der Umgebung, und `prompt.spec` wegen der noch nicht
  eingecheckten Änderung an `src/core/prompt.ts` im Arbeitsverzeichnis.

## Log

- 2026-08-13 status → ready (app)
- 2026-08-13 status → in-progress (agent)
- 2026-08-13 MCP-Server gebaut (core/mcp + electron/mcp-server + Build-Einstieg); status → review
- 2026-08-13 status → in-progress (agent)
- 2026-08-13 status → review (agent)
