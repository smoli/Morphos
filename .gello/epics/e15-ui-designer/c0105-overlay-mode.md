---
id: c0105
title: "Overlay design mode — toggle + read-only render"
status: review
epic: e15
depends: [c0104]
created: 2026-08-16
updated: 2026-08-17
status-changed: 2026-08-17T06:54:35
usage-tokens: 51208
usage-cost: 7.990597
---

# Overlay design mode — toggle + read-only render

## What

A translucent design overlay drawn over the active app window, toggled from the
window titlebar (and a keyboard shortcut). When on, it loads the design via
`core/design` and renders each block as a labelled box positioned by its
`rect`, with nested blocks drawn inside their parents. Render and open/close
only — no editing yet.

## Acceptance criteria

- [x] A titlebar control (and shortcut) toggles design mode for the active app
      window; Escape closes it.
- [x] While on, a translucent layer covers the running app without breaking the
      app underneath.
- [x] Existing blocks from `design.ui.json` render as boxes at their `rect`,
      each showing its name; nested blocks render inside their parent.
- [x] An empty/absent design shows an empty overlay (no crash).
- [x] A `.spec.ts` covers toggling and rendering a sample design tree.

## Notes

Mirror the existing panel/overlay patterns (`ExplorerPanel`, `DocsPanel`,
`AppWindow`). Keep the layer purely presentational here — editing lands in
c0107 onward.

**Where the state lives.** Design mode belongs to the app window, next to the
chat: `designOpen` / `design` in `stores/app` with `openDesign` /
`closeDesign` / `toggleDesign` / `loadDesign` and the `designBlocks` getter.
That is what lets the shortcut and Escape reach it from `DesktopView` (like
`composerOpen`), and it keeps every window's design its own. The design is read
FRESH from disk on every open — the file is the truth, not what the window saw
once.

**Reading it (the IPC of c0104).** `core/design` imports `node:fs`, so the
renderer must never import it at runtime — new host method
`readDesign(folder, id)` (preload → `morphos:readDesign` → `core/design`
`readDesign(appDir(...))`), and the renderer takes only `import type` from the
module (verified: the production renderer bundle contains no `node:fs` and no
`design.ui.json`). Missing file, broken file, missing binding or a throwing host
all end in an empty overlay, never an error message. When c0107 needs the pure
tree helpers (`addBlock` …) in the renderer, `core/design` will have to be split
into a pure model and an fs part — that is the moment for it, not before.

**Geometry.** Rects are absolute shares of the app WINDOW (c0104), but a nested
box is drawn inside its parent's box, so `DesignBlock` converts each child's
shares once: `(x − px) / pw`. Nesting is thereby visible in the DOM as well as
on screen, and the model stays absolute.

**Keys and layers.** Shortcut `Strg/⌘ + ⇧ + D` (`design`, added to
`core/shortcuts`, so the settings cheat sheet lists it). Escape now clears one
thing per press, topmost first: design, then chat (`closeActiveOverlay` in
`DesktopView`). The layer sits at z-index 4 — under the chat (6) and the error
message (5): what has something to say belongs in front. The app underneath
keeps running (same iframe); it is only untouchable while the layer lies over
it, which is what c0107 will draw on.

## Review

### 2026-08-17T06:57:13 — pass

Checked: alle fünf Akzeptanzkriterien am Code, der Diff von e9776e7, `npm test`,
`npm run typecheck`, `npm run build` (ein Lint-Skript gibt es im Repo nicht).

- Kriterium 1 (Titelleisten-Knopf, Kürzel, Escape): `.w-design` in
  `src/components/AppWindow.vue:183` ruft `store.toggleDesign()`,
  `runShortcut('design')` in `src/views/DesktopView.vue:557` hängt am neuen
  Eintrag in `src/core/shortcuts.ts:56` (`Strg/⌘ + ⇧ + D`, `matchShortcut`
  verlangt Strg/⌘, ein blankes „d“ löst nichts aus), und
  `closeActiveOverlay()` (`DesktopView.vue:182`) räumt auf Escape erst den
  Entwurf, dann den Chat. Abgedeckt in `DesktopView.spec.ts` („per
  Tastenkürzel“, „schließt ihn mit Escape“, „zuerst den Entwurf, dann den
  Chat“) und `AppWindow.spec.ts`.
- Kriterium 2 (durchscheinende Schicht, App läuft weiter): `DesignOverlay.vue`
  liegt als `position: absolute; inset: 0` im `.w-body` von `WindowFrame`,
  Untergrund `rgba(15,17,21,.35)`, z-index 4 — unter der Composer-Leiste (6).
  Das `iframe` wird nicht ausgehängt; `AppWindow.spec.ts` „lässt die laufende
  App darunter weiterlaufen“ prüft dieselbe Element-Identität vor und nach dem
  Öffnen.
- Kriterium 3 (Kästen am `rect`, Namen, Verschachtelung): `DesignBlock.vue`
  setzt `left/top/width/height` aus dem Anteil und rechnet ein Kind mit
  `(x − px)/pw` auf den Elter um (Division durch 0 abgefangen);
  `DesignBlock.spec.ts` prüft Wurzel, Name, optionale Rolle, Kind (20 % / 25 %)
  und Enkel, `DesignOverlay.spec.ts` die Reihenfolge der Namen und dass nur die
  Wurzelkästen unmittelbar auf der Fläche liegen.
- Kriterium 4 (leerer/fehlender Entwurf): `loadDesign` in `src/stores/app.ts`
  fragt bei einem Entwurf ohne App gar nicht erst, übernimmt nur ein
  `Array.isArray(design.blocks)`, schluckt den Fehler und lässt `error` null;
  der Handler `morphos:readDesign` (`electron/main.ts:1114`) fängt ab und
  liefert `emptyDesign()`. Vier Store-Tests decken fehlende Anbindung,
  werfenden Host, leeren und krummen Baum ab, `DesignOverlay` zeigt dann den
  leeren Hinweistext.
- Kriterium 5 (`.spec.ts`): `DesignOverlay.spec.ts` (5) und
  `DesignBlock.spec.ts` (5) neu, dazu je ein Block in `AppWindow.spec.ts`,
  `DesktopView.spec.ts`, `stores/app.spec.ts`, `core/shortcuts.spec.ts`.
- Prüfungen grün: 1808 Tests in 93 Dateien, `vue-tsc --noEmit` ohne Ausgabe,
  `vite build` sauber. Kein `.only`/`.skip`, kein abgeschwächter Test, kein
  Debug-Rest im Diff.
- Die fs-Grenze hält: Renderer und Store nehmen aus `core/design` nur
  `import type`; im gebauten `dist/assets/index-*.js` kommt weder `node:fs`
  noch `readFileSync` noch `design.ui.json` vor, nur der Host-Aufruf
  `readDesign` (nachgeprüft nach `npm run build`).
- Diff bleibt im What: nur Anzeigen und Öffnen/Schließen, kein Bearbeiten.
  Randnotiz ohne Belang für das Urteil: im Arbeitsverzeichnis liegt eine nicht
  eingecheckte Leerzeile in `src/components/TopBar.vue` — gehört nicht zu
  e9776e7, sollte aber weg.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 status → in-progress (agent)
- 2026-08-17 `DesignOverlay.vue` + `DesignBlock.vue` (+ specs), `readDesign`
  through preload/main, design state in `stores/app`, 📐 in the titlebar,
  `Strg/⌘ + ⇧ + D` and Escape in `DesktopView`. Full suite 1808 tests green,
  `vue-tsc` clean, `npm run build` clean.
- 2026-08-17 status → review (agent)
