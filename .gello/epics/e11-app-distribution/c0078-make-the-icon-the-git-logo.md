---
id: c0078
title: Make the icon the git logo
status: done
ref: c0074
epic: e11
created: 2026-08-12
updated: 2026-08-13
commit: 2fe200b
status-changed: 2026-08-13T16:32:08
usage-tokens: 17738
usage-cost: 1.907976
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

## Review

### 2026-08-12T22:37:39 — pass

Checked: Akzeptanzkriterien, Diff von 2fe200b, Tests, Typecheck, Build.

- Kriterium 1 erfüllt: `src/views/DesktopView.vue:799` trägt im Platz
  `.dock-item.import` `<GitLogo class="dock-glyph" :size="28" />`; der Textpfeil
  `⤓` ist weg (`grep -rn "⤓" src/` findet ihn nur noch in der Zusicherung
  `DesktopView.spec.ts:2200`).
- Kriterium 2 erfüllt: `src/components/GitLogo.vue` ist eine eigene Komponente
  mit `size`-Prop (Vorgabe 26, wie `AppIcon`), `role="img"` und `aria-label`;
  das Logo steckt als einzelner Pfad im SVG, kein `<img>`, kein Netzzugriff.
  Der Pfad ist der offizielle von Jason Long (CC BY 3.0), der Zweig als
  Aussparung — im Original ebenso, und auf der Karte offengelegt.
- Kriterium 3 erfüllt: `title="App aus Git laden…"` und `@click="openImport"`
  stehen unverändert (`DesktopView.vue:791-800`); der Diff fasst sonst nichts
  am Dock an. Kein Test abgeschwächt, übersprungen oder `.only`; die neuen
  Fälle sind reine Zusätze.
- `npm test` grün: 85 Dateien, 1548 Tests, 0 Fehler. `npm run typecheck`
  (vue-tsc) ohne Befund, `npm run build` ohne Befund.
- Lint nicht gelaufen: `package.json` hat kein Lint-Skript, im Repo ist keins
  eingerichtet.
- Kein fremder Umfang im Commit; die einzige Änderung außerhalb der Karte und
  der Quellen ist `.gello/.companion/state.json` (Companion-Buchhaltung).

## Log

- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
- 2026-08-12 implemented in 2fe200b (agent)
- 2026-08-13 status → done (app)
