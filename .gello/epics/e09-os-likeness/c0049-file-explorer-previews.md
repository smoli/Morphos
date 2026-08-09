---
id: c0049
title: "File-Explorer: content previews"
status: done
epic: e09
depends: [c0048]
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T07:37:53
usage-tokens: 66843
usage-cost: 6.807762
---

## What

Preview the selected file's content — rich preview for passive types, and
**sandboxed** rendering for active HTML/SVG, so untrusted files never execute in
the trusted renderer.

## Acceptance criteria

- [x] Passive types preview richly: **images**, **video**, **audio**, **markdown**
      (escape-first `core/markdown`), **JSON** (pretty-printed + syntax-
      highlighted), **text**.
- [x] **HTML/SVG** preview inside a **sandboxed iframe** (allow-scripts, no
      same-origin, CSP) — the same isolation as generated apps (AppCanvas pattern).
- [x] Large/binary media load via a **scoped stream** (custom protocol or blob),
      not by inlining the whole file; oversized text/JSON is capped with a notice.
- [x] Unknown/unpreviewable types show file info (name, size, type) without
      attempting to render.
- [x] Preview type-detection and the JSON/text formatting (pure) are covered by
      unit tests; the HTML sandbox + escaping by component tests.

## Notes

- **`core/preview`** hält die Regeln (rein): Endung → Art, die beiden
  Größendeckel, das JSON-Färben und das Sandbox-Dokument. Der Schnitt, um den es
  geht, ist **passiv vs. aktiv**: Bild/Video/Ton/Markdown/JSON/Text zeigt die
  Schale selbst — alles, was dabei zu HTML wird, geht escape-first durch
  `core/markdown` bzw. `highlightJson` (jedes Stück, auch die Zwischenräume,
  wird escapt, die einzigen Tags sind die erzeugten `<span>`). **HTML und SVG**
  werden nicht gezeigt, sondern in dieselbe Sandbox gesteckt wie eine erzeugte
  App: blob:-Dokument im iframe mit `allow-scripts` **ohne** `allow-same-origin`
  und ohne `allow-popups`, davor die `CSP_META` aus `core/appfs`. Gefiltert wird
  nichts — die Isolation trägt, nicht das Aussieben.
- **Der eingegrenzte Strom (`core/filelink`, `morphos-file://`)**: Medien wandern
  nie durch den IPC-Kanal. Der Hauptprozess meldet ein eigenes Schema an
  (standard/secure/stream) und prüft jede Anfrage wie jeden Dateizugriff —
  freigegebener Datenordner, Pfad eingegrenzt, kein Symlink hinaus
  (`resolveWithin`, jetzt aus `core/fsaccess` exportiert und auch von `runFs`
  benutzt). Teilanfragen beantwortet der Hauptprozess **selbst** (206 samt
  `Content-Range`): Electrons file:-Loader kürzt zwar den Inhalt, meldet aber 200
  ohne Bereichsangabe — damit könnte kein Abspieler spulen (in einer
  Electron-Probe nachgemessen: 200/206/416 und `<img>` im Renderer laden).
- **Der Strom kann nichts Aktives ausliefern:** `streamMimeType` nennt einen
  echten Typ nur für Bild/Video/Ton, alles andere geht als
  `application/octet-stream` samt `X-Content-Type-Options: nosniff` hinaus. Die
  erzeugten Apps erreichen das Schema ohnehin nicht — ihre CSP lässt Ressourcen
  nur als `data:`/`blob:` zu.
- **Entschieden:** Verlässlich sind die Formate, die Chromium überall abspielt —
  **mp4 (H.264/AAC)**, **webm**, **mp3/wav/ogg**; mov/ogv/m4a/flac/aac stehen
  mit dabei, weil der Versuch nichts kostet, und misslingt er, sagt die Vorschau
  das. Deckel: **512 KB** Text (`TEXT_LIMIT`) — darüber wird gar nicht erst
  gelesen, sondern die Größe gemeldet; ein knapp darunter liegender Inhalt wird
  gekappt und der Hinweis steht unter der Vorschau. Für Medien gibt es keinen
  Deckel, sie werden ja gestreamt.

## Log

- 2026-08-08 created from the c0038 File-Explorer breakdown
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 implemented: `core/preview` (Arten, Deckel, JSON-Färben,
  Sandbox-Dokument), `core/filelink` (`morphos-file://`, Teilanfragen),
  `resolveWithin` in `core/fsaccess`, Strom-Handler im Hauptprozess,
  `FilePreview.vue` und die Vorschau-Spalte im Explorer — 881 Tests grün
  (54 neu), Typecheck und Build sauber
- 2026-08-09 status → review (agent)
- 2026-08-09 status → done (app)
