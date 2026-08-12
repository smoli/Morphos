---
id: c0077
title: Create a readme for an app
status: done
created: 2026-08-12
commit: e31d059
updated: 2026-08-12
status-changed: 2026-08-12T22:31:38
epic: e11
usage-tokens: 64612
usage-cost: 8.140769
---

Add the option to create a Readme for the app.

Structure

```
<App Icon centered>

<App Name>

<Quick description of what it is and does.>

# Details

<Reference to user documentation and concept file>

# Morphos

<info on the minimal morphos version/commit this needs to work>


```

## What

Every Morphos app **is** its own git repo (e11: push it to a remote, clone it
back with c0074) — so it needs a **front page**: a `README.md` in the app folder
that shows the app's icon and name, says in a sentence what it is, points to its
two documents and names the Morphos version it came from. Written by the
**shell** from what it already knows (manifest + `concept.md`), not by the LLM,
on an explicit action per app — and committed, so it travels with a push.

## Acceptance criteria

- [x] A per-app action **„Readme erstellen“** (context menu of the app tile)
      writes `README.md` into the app folder; success and failure are reported
      as a toast. Running it again **rewrites** the file (idempotent).
- [x] The README follows the card's structure: **icon centered**, the **app
      name**, a **short description**, a **Details** section linking
      `concept.md` and `userdocumentation.md`, and a **Morphos** section naming
      the version/commit the app needs.
- [x] The short description comes from the app's **`concept.md`** (first
      paragraph, headings/code fences skipped, capped), falling back to
      `userdocumentation.md` and then to a neutral line; a link to a **missing**
      doc is left out.
- [x] An **image icon** travels as a real file next to the README (`icon.png`,
      `.jpg`, `.gif`, `.webp`) so it shows on a repo page; an **emoji** icon is
      rendered centered inline. A stale icon file of an earlier README is
      removed.
- [x] README (and icon file) are **committed** to the app's repo — a clone
      brings them along.
- [x] It works for a **closed** app (manifest and docs are read from disk), and
      only inside a **known workspace folder** (like `diskUsage`/`importApp`);
      an unknown folder or an app without `app.json` is refused with a clear
      message.
- [x] `README.md` stays **shell-written**: the LLM's file protocol still rejects
      it, and a generation neither deletes nor overwrites it.
- [x] Building the readme (structure, description extraction, icon asset,
      version line) and the write+commit are covered by **unit tests**, the menu
      entry and the store action by **component/store tests**.

## Notes

Implemented (2026-08-12):

- `core/readme` (new, main process only) is the whole thing: `shortDescription`
  (first real paragraph of `concept.md` — headings, code fences and comments
  skipped, markdown characters removed, capped at 300 chars on a word
  boundary), `iconAsset`, `buildReadme` (pure) and `writeReadme` (the two
  files). It **does not commit** — that stays with the caller (`main.ts`), like
  everywhere else in this repo.
- **Written by the shell, not by the LLM.** The card gives a fixed structure and
  Morphos already knows every piece of it (manifest + the two docs), so a
  generation pass would only cost tokens and drift. `README.md` therefore stays
  outside the file protocol: `isValidOutputPath('README.md')` is already
  `false` (asserted in `files.spec`), DELETE only takes `src/` paths, and
  `writeAppState` only wipes `src/` — a new generation leaves the readme alone
  (own test in `readme.spec`).
- **Icon:** an emoji goes inline (`<h1 align="center">🧮<br>Name</h1>` — a
  heading is the only way to show it big without a `style` attribute, which
  repo pages strip). An image icon lives in the manifest as a `data:`-URI, and
  repo pages throw those out of `<img>`, so it is written as a **real file**
  next to the readme (`icon.png`/`.jpg`/`.gif`/`.webp`, chosen by its mime
  type) and referenced by name. A stale icon file from an earlier readme is
  removed, so switching image → emoji leaves nothing behind.
- **Escaping:** name and description end up inside HTML, so both go through
  `markdown.escapeHtml`; the description additionally loses its markdown
  characters (inside an HTML block nothing renders them). Version and commit
  are only printed if they *look* like a version / a hex sha — the readme
  should never carry through whatever a manifest or build claims.
- **Morphos-Stand:** the version comes from `app.getVersion()` (package.json),
  the commit from a new build constant `__MORPHOS_COMMIT__` (`vite.config.ts`
  runs `git rev-parse --short HEAD` at build time and defines it for the main
  build; declared in `electron/env.d.ts`). Without git it stays empty and the
  readme just names the version. Verified in the built `dist-electron/main.js`.
- IPC `morphos:createReadme` (folder + id) goes through the existing
  `knownWorkspaceError` and `appDir`/`safeId`, then `ensureRepo` +
  `commitAll('Readme erstellt' | 'Readme aktualisiert')` — the readme travels
  with a push. Store action `workspace.createReadme`, menu entry
  „Readme erstellen“ (📄) between „Icon ändern“ and the dock entry, result as a
  toast.
- Checked against **real apps** from `~/Documents/MorhpOS-Desk-1` (copies): one
  without docs (older app → „führt noch kein Konzept…“) and one with both docs
  (Nodegrafik → its concept's first paragraph as the description). The
  markdown-stripping of the description comes from exactly that run.
- Not covered by tests, as everywhere in this repo: the IPC handler in
  `electron/main.ts` itself (there is no main-process test level) — its two
  parts, `writeReadme` and `commitAll`, are tested separately.

## Review

### 2026-08-12T21:39:07 — pass

Checked: alle acht Akzeptanzkriterien gegen den Code, der Diff von `e31d059`,
`npm test`, `npm run typecheck`.

- Menüeintrag + Toast: `DesktopView.vue:601` setzt „Readme erstellen“ (📄)
  zwischen „Icon ändern“ und den Dock-Eintrag, `createReadme()` meldet Erfolg
  und Fehler als Toast; beides durch `DesktopView.spec.ts` (Menüreihenfolge,
  Erfolgs- und Fehlerfall) und `workspace.spec.ts` (vier Fälle, inkl. fehlendem
  Arbeitsverzeichnis und fehlender Anbindung) gedeckt. Wiederholtes Schreiben
  ist idempotent — `readme.spec` „schreibt beim zweiten Mal einfach neu“ prüft
  auch, dass nur eine Readme-Datei im Ordner liegt.
- Struktur: `buildReadme` (`readme.ts:186`) liefert Icon mittig, Name,
  Kurzbeschreibung, `## Details` mit den beiden Verweisen und `## Morphos` mit
  der Standzeile; je ein Test pro Teil. (Die Karte skizziert `# Details`/
  `# Morphos`, der Code nimmt H2 unter der H1-Überschrift — die Kriterien
  schreiben keine Ebene fest, das ist die richtige Lesart.)
- Beschreibung: `shortDescription` nimmt den ersten echten Absatz von
  `concept.md` (Überschriften, Code-Fences, Kommentare übersprungen, Markdown
  entfernt, bei 300 Zeichen an der Wortgrenze gekappt), weicht auf
  `userdocumentation.md` aus und fällt sonst auf den neutralen Satz zurück;
  `details()` lässt den Verweis auf ein fehlendes Dokument weg. Sechs Tests in
  `readme.spec`.
- Icon: `iconAsset` schreibt das Bild-Icon nach Mime-Typ als `icon.png`/`.jpg`/
  `.gif`/`.webp` neben das Readme, ein Emoji steht inline im zentrierten H1;
  `writeReadme` räumt eine nicht mehr gültige Bilddatei weg (eigener Test), SVG
  und kaputte data:-URIs werden abgewiesen.
- Commit: `main.ts:850` ruft `ensureRepo` + `commitAll('Readme erstellt' |
  'Readme aktualisiert')`; `ensureGitignore` schließt nur `/chat.json` aus, also
  reisen `README.md` und `icon.*` mit. `readme.spec` „wird ein Commit im
  Repository der App“ belegt über `listVersions`, dass der zweite Commit
  zustande kommt.
- Geschlossene App und bekanntes Arbeitsverzeichnis: `writeReadme` liest
  Manifest und Dokumente über `readManifest`/`readDocs` von der Platte, die App
  muss nicht offen sein; der Handler geht durch `knownWorkspaceError` (wie
  `revealFolder`/`diskUsage`) und `appDir`/`safeId`, ohne `app.json` wirft
  `writeReadme` „Diese App hat kein Manifest (app.json).“ vor jedem Schreiben —
  Meldung als `{ ok: false, error }` getestet in `readme.spec` und
  `workspace.spec`.
- `README.md` bleibt schalengeschrieben: `isValidOutputPath('README.md')` ist
  `false` (`files.spec:44`, dazu der FILE-Block-Test in `files.spec:141`), DELETE
  nimmt nur `isValidSourcePath` (`files.ts:77`), `writeAppState` löscht nur
  `src/` — `readme.spec` „bleibt stehen, wenn die App neu generiert wird“ prüft
  genau das an der echten `writeAppState`.
- `__MORPHOS_COMMIT__`: `vite.config.ts` definiert die Konstante für den
  Hauptprozess-Build, ohne Git bleibt sie leer; im gebauten
  `dist-electron/main.js` steht sie als `commit: "4bb6372"` — der Define greift.
  `cleanVersion`/`cleanCommit` verschweigen unglaubwürdige Werte (Test dazu).
- Grün: `npm test` 1544 Tests in 84 Dateien, `npm run typecheck` ohne Befund.
  Kein Lint-Skript im Manifest — es gibt keines zu laufen.
- Diff bleibt im What: `core/readme` (neu) plus IPC, Preload, Typ, Store, Menü
  und die Build-Konstante für die Standzeile. Kein Debug-Code, kein `.only`/
  `.skip`, kein abgeschwächter Test.

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
- 2026-08-12 status → done (app)
