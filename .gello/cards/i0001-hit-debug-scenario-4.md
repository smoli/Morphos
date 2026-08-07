---
id: i0001
title: "Hit debug scenario: 4"
status: done
type: issue
tags: [ui, security, electron]
created: 2026-08-07
updated: 2026-08-07
status-changed: 2026-08-07T23:07:34
usage-tokens: 34928
usage-cost: 3.023359
---

# Hit debug scenario: 4

`[ERROR:debug_utils.cc(14)] Hit debug scenario: 4` erscheint immer wieder auf
der Konsole, sobald die App läuft.

## Notes

**Woher die Meldung kommt.** Sie stammt nicht aus Morphos, sondern aus Chromium
(`content/common/debug_utils.cc`, im Electron-Framework-Binary nachgewiesen).
Szenario 4 ist `kDebugBrowserVsRendererOriginToCommit`: Browser- und
Renderer-Prozess berechnen für einen Commit unterschiedliche Origins. Chromium
schreibt dafür eine ERROR-Zeile und zählt eine Metrik — es ist ein
Diagnose-Haken für einen Chromium-eigenen Fehler, kein Fehler unserer App.

**Auslöser.** Reproduziert mit einer minimalen Electron-Testumgebung
(offscreen-Fenster, Electron 33 aus `node_modules`), eine Zeile pro Commit:

| Variante                                          | Meldungen   |
| ------------------------------------------------- | ----------- |
| iframe ohne `sandbox`, Inhalt via `srcdoc`         | 0           |
| `sandbox` **mit** `allow-same-origin` + `srcdoc`   | 0           |
| `sandbox` **ohne** `allow-same-origin` + `srcdoc`  | 1 je Commit |
| `sandbox` ohne `allow-same-origin` + `blob:`-URL   | 0           |
| `sandbox` ohne `allow-same-origin` + `data:`-URL   | 0           |

Es ist also genau unsere `AppCanvas`: ein sandboxed `srcdoc`-iframe ohne
`allow-same-origin`. Daher „von Zeit zu Zeit" — jeder Agentenlauf tauscht das
HTML aus und erzeugt eine weitere ERROR-Zeile.

**Warum nicht `allow-same-origin`.** Das wäre die andere meldungsfreie
Variante, kommt aber nicht in Frage: der generierte Code bekäme Zugriff auf
Host und Storage. Das Sicherheitsmodell bleibt unangetastet.

**Lösung.** `AppCanvas` lädt das Dokument als `blob:`-URL statt über `srcdoc`.
Die Isolation ist nachweislich identisch — im Vergleichstest meldeten beide
Varianten `origin=null`, `localStorage` blockiert, `parent.document` blockiert,
`event.origin === 'null'`, CSP durchgesetzt. Ein Gegentest mit der echten
`CSP_META` und dem echten `BRIDGE_SDK` zeigt in beiden Varianten denselben
funktionierenden `morphosFS`-Umlauf, aber nur `srcdoc` schreibt die ERROR-Zeile.
Für die erzeugten Apps ändert sich nichts: die injizierte CSP ist
`default-src 'none'` mit `base-uri 'none'`, relative URLs und Netzwerkzugriffe
waren also ohnehin ausgeschlossen.

Die Objekt-URL wird beim HTML-Wechsel und beim Abbau der Komponente wieder
freigegeben. `jsdom` kennt keine Objekt-URLs — dafür gibt es jetzt
`src/test-setup.ts` (in `vitest.config.ts` eingehängt).

## Acceptance

- [x] Ursache benannt und belegt (Chromium `kDebugBrowserVsRendererOriginToCommit`)
- [x] Auslöser reproduziert und eingegrenzt (sandboxed `srcdoc` ohne `allow-same-origin`)
- [x] Meldung verschwindet, ohne die Sandbox aufzuweichen
- [x] Isolation nachweislich unverändert (opaker Origin, kein Host-/Storage-Zugriff, CSP)
- [x] Tests grün (281) und `vue-tsc` sauber

## Log

- 2026-08-07 status → ready (app)
- 2026-08-07 status → in-progress (agent)
- 2026-08-07 Ursache in Chromium verortet, Auslöser per Electron-Testumgebung eingegrenzt
- 2026-08-07 AppCanvas auf `blob:`-Dokument umgestellt, Tests ergänzt
- 2026-08-07 status → review (agent)
- 2026-08-07 status → done (app)
