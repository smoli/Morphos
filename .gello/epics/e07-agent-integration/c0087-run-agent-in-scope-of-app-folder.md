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

- [x] `runClaude` spawns `claude` with `cwd` = the app folder; Read/Glob/Grep resolve against that app.
- [x] `morphos:generate` receives the app `folder` + `id` (or resolves `appDir`); the main process works on the on-disk app, not on in-memory files from the payload.
- [x] The app is materialised on disk (git-backed folder) before the run — disk is the single source of truth for the agent.
- [x] Morphos launches a **stdio MCP server** for the run exposing a **write/edit** tool (create/replace + targeted edit; delete as needed) and an **ask** tool (Rückfrage).
- [x] The MCP write tool confines every path via `core/fsaccess: confineWithin` and rejects anything outside `src/` and the two root docs (concept, user doc).
- [x] Native **Write/Edit are disabled**; `--allowedTools` permits only the MCP write/ask tools plus native **Read/Glob/Grep** (and `Read(<image>)` for attachments).
- [x] Calling **ask** marks the run a pure Rückfrage: nothing committed, chat opens with the question — no output-marker parsing.
- [x] After a run that wrote files, Morphos re-reads `src/` + docs from disk, bundles, and makes **one commit** (message = the user's wish). A run with only `ask` / no writes produces no commit.
- [x] The agent's final assistant message is surfaced in chat as the Mitteilung.
- [x] Old machinery retired: `parseLLMOutput` / `applyChanges` / `splitDocs`, `serializeFiles`-into-prompt, and the `MORPHOS:*` markers (incl. the streaming markers in `core/agent.ts`) are removed or reduced to what the new path still needs.
- [x] Concurrency: two runs never target the same app folder at once (per-app serialisation).
- [x] Tests cover cwd wiring, MCP write confinement (reject `..` / outside `src/`), ask ⇒ no-commit, write ⇒ commit + re-read + bundle.

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

## Notes

**Was entstanden ist**

- `src/core/generate.ts` — der ganze Lauf als reine Ablauf-Logik: Ordner
  bereitstellen (samt `ensureRepo`) → Agenten MIT dem App-Ordner als
  Arbeitsverzeichnis starten → Lauf-Protokoll des MCP-Servers lesen → bei
  Änderungen von der Platte zurücklesen, bündeln, Manifest + Artefakt schreiben,
  EIN Commit. Alles, was nur der Hauptprozess kann (CLI, Bibliotheks-Cache,
  Git), kommt als `GenerateDeps` von außen — darum ist der ganze Weg ohne echten
  Agenten prüfbar (`generate.spec.ts`, 23 Tests).
- `src/core/mcptools.ts` — die Namen der Werkzeuge, herausgelöst aus
  [[c0088]]s `core/mcp`. Grund: `core/agent` liest den Fortschritt an den
  Werkzeugaufrufen ab und läuft im **Renderer** — es darf `node:fs` nicht
  hereinziehen (`core/mcp` tut das). `core/mcp` re-exportiert sie.
- `electron/main.ts` ist nur noch Verdrahtung: `runClaude(prompt, cwd, …)`,
  `generateApp(…)`, eine Protokolldatei je Lauf im Temp-Ordner (nie im
  App-Ordner — sie käme sonst in den Commit) und `createSerialQueue` als Riegel
  je App-Ordner.
- Prompt: kein Dateiinhalt mehr im Prompt (kein `serializeFiles`, keine
  Dokumenten-Abschnitte) — nur noch der Hinweis, dass die App im
  Arbeitsverzeichnis liegt. Der Systemprompt nennt die Werkzeuge beim Namen
  (`mcp__morphos__write/edit/delete/ask`) und sagt, dass Write/Edit/Bash der CLI
  nicht zur Verfügung stehen.
- Retired: `parseLLMOutput`, `applyChanges`, `serializeFiles`, `FILE_MARKER`,
  `splitDocs`, `hasDocChanges`, `applyDocs`, `FileChanges`/`DocChanges`, die
  Marken-Erkennung im Strom (`core/agent`), `morphos:saveApp` samt
  `MorphosHost.saveApp` und `store.persist` (der Hauptprozess committet selbst).

**Entscheidungen**

- **Entwurf zuerst, Name danach.** Ein Entwurf braucht schon vor dem Lauf einen
  Ordner (der Agent arbeitet darin). Er entsteht als `neue-app-<rand>` und wird
  nach dem Lauf auf den Namen umbenannt, den die App sich selbst gegeben hat —
  vor dem ersten Commit, die Historie merkt davon nichts. Scheitert das
  Umbenennen (Windows hält einen eben beendeten Kindprozess-CWD mitunter noch
  kurz), bleibt es beim Entwurfsnamen: gültige Id, vollständige App. Ein Entwurf,
  der nichts hinterlässt (Fehler, reine Rückfrage), wird wieder weggeräumt — ohne
  `app.json` ist er ohnehin keine App.
- **`ask` + Schreiben zugleich ⇒ es wird committet.** Die Karte fordert „nichts
  committet" für die Rückfrage und „kein Commit, wenn nur `ask`/nichts
  geschrieben". Maßgeblich ist das Lauf-Protokoll: Gab es ≥1 Änderung, wird
  committet UND die Frage gestellt; gab es keine, gibt es keinen Commit. Sonst
  blieben Änderungen uncommittet auf der Platte liegen — das wäre der schlechtere
  Ausgang.
- **Ein Lauf ohne Änderung und ohne Frage** ist kein Fehler mehr, sondern eine
  Mitteilung („Das kann die App bereits."). Vorher gab es dafür „Es wurden keine
  verwertbaren Dateien erzeugt".
- **Fehlschlag an einer BESTEHENDEN App lässt die Arbeit des Agenten stehen**
  (kein `git checkout`): Der Ordner ist ein Repository, der letzte Commit liegt
  daneben, der nächste Lauf setzt darauf auf. Nur ein Entwurf wird verworfen.
- **`--disallowedTools`** (Write, Edit, MultiEdit, NotebookEdit, Bash, WebFetch,
  WebSearch) kam zu `agentMcpArgs` dazu: „nicht freigegeben" ist implizit,
  „verboten" ist ausdrücklich. Ergänzt damit [[c0088]] an dessen Aufrufteil.
- **`--add-dir`** für den Ordner eines Bild-Anhangs: Er liegt außerhalb des
  Arbeitsverzeichnisses und wäre sonst unlesbar.
- **`morphos:generate` verlangt jetzt ein BEKANNTES Arbeitsverzeichnis**
  (`recentFolders`), wie diskUsage/importApp/createReadme — der Agent legt dort
  Dateien an.

**Geprüft**

- `npx vue-tsc --noEmit` → Exit 0. `npx vite build` → Renderer, `main.js`,
  `mcp-server.js`, `preload.cjs`; im Renderer-Bündel steckt kein `node:fs`
  (deshalb `core/mcptools`).
- Neu/angepasst: `generate.spec` (23), `queue.spec` (+4 für `createSerialQueue`),
  `prompt.spec` (27), `agent.spec` (24), `mcp.spec` (48), `app.spec` (46),
  `agents.spec` (30), `files.spec`/`docs.spec` auf das Verbliebene eingekürzt.
- Volle Suite: 1684 grün, 13 rot — dieselben umgebungsbedingten wie bei
  [[c0088]] (Symlink-Tests: dieser Rechner darf keine Symlinks anlegen;
  `findGh`; `appimport` 8.3-Kurzpfad; `appstore`-Revert wegen CRLF). Zwei
  weitere Rote treten nur im vollen, parallelen Lauf auf (git-Proben mit
  5-Sekunden-Zeitüberschreitung) und sind einzeln grün.
- **Nicht geprüft:** ein echter Lauf mit der Claude CLI in einem App-Ordner —
  dafür braucht es eine laufende Morphos-Instanz und eine Claude-Anmeldung.
  Der MCP-Server selbst ist in [[c0088]] am echten Prozess rauchgeprüft.

## Log

- 2026-08-13 status → ready (app)
- 2026-08-13 status → discuss (app)
- 2026-08-13 discussed → backlog; moved e0001 → e07; split out [[c0088]] (depends)
- 2026-08-13 status → ready (app)
- 2026-08-13 status → in-progress (agent)
- 2026-08-13 Umstellung auf den App-Ordner: core/generate + MCP-Aufrufstelle,
  Blockprotokoll entfernt; status → review
