---
id: c0088
title: Morphos stdio MCP server — write/edit + ask tools with path confinement
status: done
created: 2026-08-13
updated: 2026-08-13
status-changed: 2026-08-13T19:09:43
epic: e07
usage-tokens: 57623
usage-cost: 5.680914
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

## Review

### 2026-08-13T18:59:06 — pass

Checked: alle sechs Kriterien am Code, der Diff von 655682a, `npx vitest run`
(einzeln und volle Suite), `npx vue-tsc --noEmit`, `npx vite build` und eine
eigene Rauchprobe am gebauten Server.

- Kriterium 1 (Server liegt bei, streng über `--mcp-config`): `electron/mcp-server.ts`
  entsteht durch den zweiten Rollup-Einstieg in `vite.config.ts` als
  `dist-electron/mcp-server.js` (`npx vite build` → Exit 0, Datei da).
  `agentMcpArgs` (src/core/mcp.ts:539) liefert `--mcp-config <json>
  --strict-mcp-config`, `mcpConfigJson` genau einen Server; beides getestet.
  **Die Aufrufstelle fehlt bewusst:** niemand ruft `agentMcpArgs`/`mcpLaunch`
  auf (`electron/main.ts`, `src/core/agent.ts` kennen `core/mcp` nicht). Das ist
  die Abgrenzung, die die Karte nennt und die [[c0087]] als eigenes Kriterium
  führt („Morphos launches a stdio MCP server for the run", `depends: [c0088]`) —
  darum kein Mangel dieser Karte, aber bis c0087 ist der Server im echten Lauf
  nicht in Gebrauch.
- Kriterium 2 (write/edit, delete/mkdir nach Bedarf): `write`/`edit`/`delete` in
  src/core/mcp.ts:298-371; `edit` besteht auf einer eindeutigen Stelle bzw.
  `replace_all`, `write` legt fehlende Ordner mit an. Kein `mkdir` — auf der
  Karte begründet und stichhaltig.
- Kriterium 3 (ask): `ask` (src/core/mcp.ts:373) nimmt genau eine Frage,
  weist die zweite ab und schreibt sie ins Journal; `wroteSomething`
  (src/core/mcp.ts:109) zählt eine reine Rückfrage NICHT als Änderung, also
  kein Commit. Chat-Öffnen gehört zu [[c0087]].
- Kriterium 4 (Grenze): `writablePath` → `confineWithin` + `isValidOutputPath`,
  danach `resolveWithin` gegen Symlinks (src/core/mcp.ts:63-91). `..`,
  absolute Pfade, `app.json`, `.git/config` und `src` selbst fallen durch —
  getestet und in der Rauchprobe am echten Prozess bestätigt (`../escape.txt`
  und `app.json` abgewiesen, nichts außerhalb des Ordners entstanden).
- Kriterium 5 (Buchführung): `note` schreibt jeden Vorgang als JSON-Zeile,
  `parseRunLog`/`wroteSomething` lesen sie zurück; ein Journal-Fehler kommt als
  Werkzeugfehler zurück statt still zu bleiben. Ohne Vorgang entsteht keine Datei.
- Kriterium 6 (Unit-Tests): `npx vitest run src/core/mcp.spec.ts` → 47/47 grün,
  kein `.only`, kein `.skip`, keine abgeschwächte Erwartung.
- `npx vue-tsc --noEmit` → Exit 0. Lint gibt es im Projekt nicht (`package.json`
  hat nur `test`/`typecheck`/`build`), also nichts zu laufen.
- Volle Suite: 1677 grün, 19 rot in 6 Dateien — keine davon berührt der Diff,
  und keine importiert `core/mcp`: Symlink-Tests in `fsaccess`/`diskusage`
  (dieser Rechner darf keine Symlinks anlegen), `gitstore > findGh` (Umgebung),
  `appimport` (8.3-Kurzpfad `STEPHA~1.SMO` in der origin-URL), `appstore`
  Revert-Dokumente (CRLF statt LF) und 6× `prompt.spec` gegen die noch
  **nicht eingecheckte** Änderung an `src/core/prompt.ts` im Arbeitsverzeichnis
  (sie entfernt genau die Blockformat-Zeilen, die die Tests erwarten). Dass
  diese 19 auf einem sauberen Rechner grün sind, konnte ich hier nicht prüfen.
- Zwei Hinweise für [[c0087]], kein Mangel dieser Karte:
  - Ein absoluter Pfad auf einem ANDEREN Laufwerk wird nicht abgewiesen, sondern
    umgebogen: `path.relative` gibt bei fremdem Laufwerk den absoluten Pfad
    zurück, `confineWithin` streicht den Laufwerksbuchstaben — `D:\src\app.js`
    landet als `<root>/src/app.js`. Es bricht nichts aus, aber es wird eine
    andere Datei geschrieben als genannt.
  - `main.js` ist nach der Build-Umstellung nicht mehr in sich geschlossen: aus
    den zwei Einstiegen entsteht der gemeinsame Brocken `dist-electron/fsaccess.js`,
    den `main.js` importiert. Heute harmlos (es gibt noch keine
    electron-builder-Konfiguration), beim Paketieren muss der ganze Ordner mit.

## Log

- 2026-08-13 status → ready (app)
- 2026-08-13 status → in-progress (agent)
- 2026-08-13 MCP-Server gebaut (core/mcp + electron/mcp-server + Build-Einstieg); status → review
- 2026-08-13 status → in-progress (agent)
- 2026-08-13 status → review (agent)
- 2026-08-13 status → in-progress (app)
- 2026-08-13 status → review (app)
- 2026-08-13 status → done (app)
