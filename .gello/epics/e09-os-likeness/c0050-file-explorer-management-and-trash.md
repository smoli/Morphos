---
id: c0050
title: "File-Explorer: file management + waste bin"
status: review
epic: e09
depends: [c0048]
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T07:39:53
---

## What

Full file **management** within the data folder — create folder, rename, move,
copy/paste, and **delete to a recoverable waste bin**. Everything confined to the
data root; operations are user actions in the trusted shell, not app fs requests.

## Acceptance criteria

- [x] **Create folder**, **rename**, **move**, and **copy/paste** work within the
      data folder; every operation is confined to the root (**source and
      destination** validated).
- [x] **Delete** moves items to a recoverable **waste bin** (a hidden trash area
      inside the data folder), not a permanent delete; the user can **restore**
      from and **empty** the trash (empty = permanent, with confirmation).
- [x] Destructive actions (delete, empty trash, overwrite on move/copy) ask for
      **confirmation**; the trash is excluded from the normal listing.
- [x] New scoped operations (**move/rename**, **copy**, **trash**) extend
      `core/fsaccess` / the `morphos:fs` IPC, guarded by `confineWithin` on every
      path; they are **user actions**, not app fs requests (no app permission
      dialog).
- [x] Confinement for move/copy (source + destination) and the trash round-trip
      (delete → restore) are covered by unit tests.

## Notes

- **`core/trash`** hält die Regeln (rein): der Papierkorb als `.trash/files`
  (das Gelöschte) plus `.trash/meta` (je ein Zettel mit Herkunft, Zeitpunkt,
  Ordner-ja/nein), `isTrashPath` (normalisiert, also auch `/.trash`,
  `.trash\files`, `sub/../.trash`), `nameError` für vom Anwender eingegebene
  Namen (kein Pfadanteil, kein führender Punkt — der wäre verborgen —, keine
  Steuerzeichen) und `uniqueName` (`note.txt` → `note (2).txt`), das sowohl der
  Kopie neben ihrem Original als auch zwei gleichnamigen Gelöschten Platz gibt.
- **`runShellFs` in `core/fsaccess`** führt aus: `newFolder`, `rename`, `move`,
  `copy`, `trash`, `trashList`, `restore`, `emptyTrash`. Jeder Pfad — Quelle
  **und** Ziel — geht durch `userPath` (normalisieren → Papierkorb aussortieren →
  `resolveWithin`, also lexikalisch eingegrenzt und kein Symlink hinaus). Dazu:
  ein Ordner kann nicht in sich selbst wandern, ein belegtes Ziel bleibt liegen
  (`code: 'exists'`), bis der Anwender `overwrite` erlaubt, und Verschieben fällt
  über Gerätegrenzen auf Kopieren-und-Löschen zurück.
- **Löschen ist ein Verschieben:** Der Papierkorb liegt IM Datenordner, das
  Gelöschte verlässt den freigegebenen Bereich also nie, und Wiederherstellen ist
  nur der Weg zurück (fehlt der Herkunftsordner, entsteht er neu). Endgültig ist
  allein „Papierkorb leeren“ — mit Rückfrage.
- **Entschieden (die offene Frage):** Die app-seitigen `morphosFS`-Ops bleiben,
  wie sie waren — Verwalten ist eine Anweisung des Anwenders, keine App-Anfrage.
  Die neuen Operationen stehen bewusst **nicht** in `FsOp`, also kommt keine App
  über `dispatchFsRequest` (ALLOWED_OPS) an sie heran, und es gibt für sie auch
  keinen Berechtigungsdialog. Umgekehrt ist der Papierkorb für die Apps **gar
  nicht da**: `runFs` weist jeden Pfad in `.trash` ab und filtert ihn aus jeder
  Liste — was der Anwender gelöscht hat, soll ihm keine App wegräumen.
- **Wiring:** eigener Kanal `morphos:shellFs` (derselbe Freigabe-Check des
  Datenordners wie `morphos:fs`) → `host.shellFs`, im Renderer optional: Fehlt
  die Anbindung (Test), bleibt der Explorer eine reine Ansicht.
- **Im Explorer**: eine Aktionsleiste (Ordner anlegen, umbenennen, kopieren,
  ausschneiden, einfügen, löschen) und eine Papierkorb-Ansicht mit
  Wiederherstellen je Eintrag und „Papierkorb leeren“ in der Fußzeile. Gefragt
  wird über `window.confirm`/`prompt` — dieselbe schlichte Art wie beim Löschen
  einer App (DesktopView); das Überschreiben fragt die Antwort `code: 'exists'`
  ab und wiederholt erst dann mit `overwrite`.

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 implemented: `core/trash` (Papierkorb- und Namensregeln),
  `runShellFs` in `core/fsaccess` (anlegen/umbenennen/verschieben/kopieren +
  Papierkorb, Quelle und Ziel eingegrenzt), `.trash` für `runFs` unsichtbar und
  unerreichbar, `morphos:shellFs` + `host.shellFs`, Aktionsleiste und
  Papierkorb-Ansicht im ExplorerPanel — 928 Tests grün (47 neu), Typecheck und
  Build sauber
- 2026-08-09 status → review (agent)
