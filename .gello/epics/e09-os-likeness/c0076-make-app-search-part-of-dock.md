---
id: c0076
title: make app search part of dock
status: review
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T21:21:36
epic: e09
usage-tokens: 11426
usage-cost: 2.092197
---

Remove the permanent button on the desktop

## Notes

- Die Lupe steht jetzt als fester Platz **ganz vorn im Dock** (`.dock-item.search`),
  vor dem ＋ und dem Holen aus Git — mit demselben Tooltip samt Tastenkürzel
  (Strg/⌘ + Leertaste oder K), das unverändert weiter gilt.
- Der Knopf „🔍 Suchen“ auf der Desktop-Fläche ist weg; in den `.desk-tools`
  bleibt nur noch das Aufräumen, sobald es etwas aufzuräumen gibt.
- Tests: `DesktopView.spec.ts` öffnet das Startmenü jetzt über den Dock-Platz;
  neuer Test prüft die Reihenfolge der festen Knöpfe und dass auf der Fläche
  kein Suchen-Knopf mehr steht.

## Review

### 2026-08-12T21:22:57 — pass

Checked: What der Karte, Diff von `91c7198`, Code in `DesktopView.vue`, Tests
(`npm test`), Typecheck (`npm run typecheck`). Eine Liste von
Akzeptanzkriterien hat die Karte nicht — geprüft wurde gegen das What
(„Remove the permanent button on the desktop") und die Notes.

- Der feste Knopf auf der Fläche ist wirklich weg: `.desk-tools` in
  `src/views/DesktopView.vue:646` enthält nur noch das Aufräumen; `.search-btn`
  kommt im `src/` nirgends mehr vor außer in der Zusicherung ihres
  Verschwindens (`DesktopView.spec.ts:1470`).
- Die Lupe steht als erster Platz im Dock (`src/views/DesktopView.vue:756`,
  `.dock-item.search`) vor dem ＋ und dem Holen aus Git, in derselben Form wie
  die beiden (`<span class="dock-glyph">`, eigene Schriftgröße in
  `DesktopView.vue:1156`).
- Tooltip und Tastenkürzel unverändert: der Titel zieht weiter
  `shortcutKeys('launcher')` (`DesktopView.vue:760`), und der Eintrag in
  `src/core/shortcuts.ts:48` (Strg/⌘ + Leertaste oder K) ist nicht angefasst.
- Kein Verlust an Erreichbarkeit: `dockVisible`
  (`DesktopView.vue:94`) ist nur im Einzel-Modus mit aktivem Fenster falsch —
  dort verdeckt die Vollbild-App ohnehin die Fläche, auf der der alte Knopf
  saß. Autohide blendet das Dock nur optisch aus.
- Tests grün: 83 Dateien, 1510 Tests, keine übersprungen, kein `.only`. Der
  neue Test `steht als erster Platz im Dock — und auf der Fläche steht kein
  Knopf mehr (c0076)` deckt beide Hälften des What ab; die angepassten Indizes
  in den Dock-Tests (`[1]` für `new`, `[2]` für `import`) sind die richtige
  Folge des neuen Platzes, keine Abschwächung.
- Typecheck grün (`vue-tsc --noEmit`, Exit 0). Ein Lint gibt es in diesem Repo
  nicht: weder ein `lint`-Skript in `package.json` noch eine ESLint-/Prettier-/
  Biome-Konfiguration — also nichts, was hier ungeprüft geblieben wäre.
- Der Diff bleibt im Rahmen: nur `DesktopView.vue`, `DesktopView.spec.ts`, die
  Karte und die Companion-`state.json`. Kein Debug-Code.

## Log

- 2026-08-12 status → backlog (app)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
