---
id: c0041
title: Desktop wallpaper
status: review
epic: e09
depends: [c0039]
created: 2026-08-08
updated: 2026-08-09
status-changed: 2026-08-09T00:09:51
usage-tokens: 39754
usage-cost: 5.005897
---

## What

Let the user set a **background** for the desktop surface — a solid color/gradient
or an image. Configured in the (revamped) settings, rendered behind the launcher
and windows, and persisted per workspace so it survives restarts.

## Acceptance criteria

- [x] Settings offers a **wallpaper** section: pick a color/gradient or choose an
      image file.
- [x] The chosen wallpaper renders as the **desktop background** (behind the
      launcher grid and windows) and does not interfere with clicking tiles or
      windows.
- [x] The setting is **persisted** (survives restart); a sensible default applies
      when none is set.
- [x] An image wallpaper is stored so it reloads offline (e.g. copied into the
      workspace / userData, or a data-URI with a size cap) — no external URL.
- [x] A way to **reset** to the default background.
- [x] Persistence + apply logic covered by tests.

## Notes

`core/wallpaper.ts` hält die Regeln: Ein Hintergrund ist eine Farbe, ein Verlauf
(zwei Farben + Winkel) oder ein Bild als data:-URI. `cleanWallpaper` tütet jeden
gemerkten wie jeden gewählten Wert ein — nur `#rgb`/`#rrggbb` und geprüfte
Rasterbilder kommen durch, damit über `wallpaperCss` nichts Fremdes in die
CSS-Angabe geraten kann. `WALLPAPER_PRESETS` sind die angebotenen Vorlagen (die
erste ist die Vorgabe).

Gemerkt wird **je Arbeitsverzeichnis** (`Settings.wallpapers`, wie
`iconPositions`/`sessions`): Store-Getter `wallpaper`/`hasWallpaper`, Aktionen
`setWallpaper`/`resetWallpaper`. Der Hauptprozess tütet beim Lesen und Schreiben
der Einstellungen ebenfalls ein (`cleanWallpapers`).

Ein gewähltes Bild wird in `WallpaperSection.vue` gerastert und auf
`MAX_WALLPAPER_PX` (bzw. weiter, bis unter `MAX_WALLPAPER_BYTES`) gerechnet — als
JPEG-data:-URI, also ohne Nachladen aus dem Netz und ohne SVG als aktiven Inhalt.
Der Desktop malt ihn in einer eigenen Ebene `.wallpaper` als erstes Kind der
Bühne (`pointer-events: none`), sodass Kacheln und Fenster unberührt bleiben.

## Log

- 2026-08-08 created from the e09 epic breakdown
- 2026-08-08 status → ready (app)
- 2026-08-09 status → in-progress (agent)
- 2026-08-09 Hintergrund je Verzeichnis: `core/wallpaper` + Store + Bereich
  „Hintergrund“ in den Einstellungen + Ebene auf dem Desktop; 34 neue Tests
  (Kern, Store, Bereich, Desktop), Gesamtsuite 737 grün, `vue-tsc` sauber
- 2026-08-09 status → review (agent)
