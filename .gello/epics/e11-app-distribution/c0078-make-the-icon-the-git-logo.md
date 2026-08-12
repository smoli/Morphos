---
id: c0078
title: Make the icon the git logo
status: review
ref: c0074
epic: e11
created: 2026-08-12
updated: 2026-08-12
commit: 2fe200b
status-changed: 2026-08-12T22:36:06
---

In the dock make the icon for the git down-load the git logo

## Acceptance criteria

- [x] Der Dock-Platz „App aus Git laden…“ (c0074) zeigt das **Git-Logo** statt
      des Textpfeils `⤓`.
- [x] Das Logo ist eine eigene Komponente mit Größe und Namen für
      Vorleseprogramme, kein eingebettetes Bild aus dem Netz.
- [x] Titel, Klick und Dialog bleiben unverändert; die bestehenden Dock-Tests
      laufen weiter.

## Notes

- `components/GitLogo.vue` (neu): das Logo als Pfad im SVG (Jason Long,
  CC BY 3.0), `viewBox="0 0 97 97"`, `size`-Prop wie `AppIcon`, `role="img"`
  mit `aria-label="Git"`. Inline statt als Datei, damit es wie die anderen
  Zeichen im Dock einfach mitwächst und ohne Netz auskommt.
- `DesktopView.vue`: der Platz `.dock-item.import` trägt
  `<GitLogo class="dock-glyph" :size="28" />` — 28 px sitzt optisch zwischen
  der Lupe (26) und dem ＋ (30). Der Zweig im Logo ist Aussparung, das Dock
  scheint durch; auf dunklem Dock also dunkler Zweig auf Orange.
- Tests: `GitLogo.spec.ts` (Pfad, Farbe, Größe, Beschriftung) und ein neuer
  Fall in `DesktopView.spec.ts` („trägt das Git-Logo als Zeichen, kein
  Textpfeil“). `npm test` 1548 Tests grün, `npm run typecheck` und
  `npm run build` ohne Befund.

## Log

- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
- 2026-08-12 implemented in 2fe200b (agent)
