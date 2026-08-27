---
id: c0117
title: "Bundle inlining — assets/ references as data: URIs"
status: in-progress
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:51:34
---

# Bundle inlining — assets/ references as data: URIs

## What

Let a running app actually use its assets. Extend `core/bundle` so that static
references to `assets/…` are resolved and **inlined as `data:` URIs** during
bundling, the only offline/CSP-safe way for the sandboxed app to load them.

`bundle` stays pure: it receives an asset map `Record<'assets/x.png', dataURI>`
the way it already takes `libs`; `generate.ts` builds the map by reading the
assets dir from disk (`readAsset` from c0116) before calling `bundle`.

**Coverage (broad, decided):** one resolver function applied to every reference
form — `<img src>`, `srcset`, `<video>/<audio>/<source>` `src`, `poster`, SVG
`<image href>`, inline `style="…url()"` attributes, and CSS `url(...)` in both
inline `<style>` blocks and bundled `src/*.css` (so `@font-face` works). The
right MIME per type; SVG as a base64 `data:` URI; an absent/unresolvable
reference left untouched. No size cap — `bundle` never fails on size.

## Acceptance criteria

- [x] `bundle` accepts an asset map `Record<relPath, dataURI>` (like `libs`);
      `generate.ts` builds it from disk before calling `bundle`.
- [x] One resolver inlines every reference form: `<img src>`, `srcset`,
      `<video>/<audio>/<source>` `src`, `poster`, SVG `<image href>`, inline
      `style="…url()"` attributes.
- [x] `bundle` inlines CSS `url(assets/…)` in both inline `<style>` blocks and
      bundled `src/*.css`, covering `@font-face` fonts.
- [x] The `data:` URI carries the correct MIME per type: image
      (png/jpg/webp/gif), font (woff2/woff/ttf/otf), data (json/csv/txt); SVG as
      a base64 `data:image/svg+xml` URI; unknown type → reference left untouched.
- [x] An absent/unresolved `assets/…` reference is left byte-for-byte untouched
      and never throws; no size cap.
- [x] Existing `src/` CSS/JS/lib inlining is unchanged.
- [x] Specs cover each reference form, the CSS `url()` path (inline + `.css`),
      per-type MIME, and the missing-asset case.

## Notes

Depends on the c0116 storage model (needs `readAsset` bytes to build the asset
map). Implements the resolved broad-coverage decision. Keep the resolver a
single function so the (already broad) set of forms stays easy to extend. No
size cap in v1 — accepted `data:`-URI bloat, revisit only if repos get heavy.

**Umgesetzt so:** `bundle(files, libs, assets)` bekommt die Karte als dritten
Satz (wie `libs`) und macht daraus EINEN Durchgang durchs Dokument
(`inlineAssets` in `src/core/bundle.ts`) — ganz zum Schluss, damit auch das eben
aus `src/*.css` eingebettete `<style>` mitgeht. Der Durchgang kennt drei Fälle:
`<style>`-Block → `url(...)`, öffnendes Tag → Attribute (`src`, `srcset`,
`poster`, `href` nur am SVG-`<image>`, `style`), `<script>`/Kommentar →
unangetastet (dort steht Code, kein Markup). Alle Formen laufen über den einen
Auflöser `assetUri`. Eingesetzt wird die `data:`-URI in CSS ohne
Anführungszeichen — base64 enthält keine, das ist in jedem Zitat sicher.

Die Karte baut `assetDataUris(dir)` in `src/core/assetstore.ts` (dort treffen
sich Bytes und Medientyp), `generate.ts` reicht sie an `bundle` durch. Ein
unbekannter Typ (`UNKNOWN_MIME`, neu benannt in `core/assets.ts`) kommt gar
nicht erst in die Karte — damit bleibt seine Referenz stehen, ohne dass `bundle`
etwas von Medientypen wissen müsste.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-27 status → in-progress (agent)
- 2026-08-27 umgesetzt: bundle(files, libs, assets) + assetDataUris; 14 neue Specs (bundle, assetstore, generate), 2170 Tests grün, vue-tsc sauber.
