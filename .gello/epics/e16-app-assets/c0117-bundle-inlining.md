---
id: c0117
title: "Bundle inlining — assets/ references as data: URIs"
status: review
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:57:32
usage-tokens: 36385
usage-cost: 3.346896
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

## Review

### 2026-08-28T00:00:03 — pass

Checked: acceptance criteria, diff, tests, typecheck; lint not run (das Repo hat
keine Lint-Konfiguration, `package.json` kennt nur `test`, `typecheck`, `build`).

- Asset-Karte als dritter Satz: `bundle(files, libs, assets)`
  (`src/core/bundle.ts:189`) mit Vorgabe `{}`; `generate.ts:187` reicht
  `assetDataUris(dir)` durch, `bundleApp` bekommt dafür `dir`. Einziger Aufrufer
  von `bundle` im Baum — nichts hängt am alten Zweiersatz.
- Ein Auflöser für alle Formen: alles läuft über `assetUri`
  (`src/core/bundle.ts:83`). Nachgeprüft an eigenen Beispielen, nicht nur an den
  Specs: `<img src>` (auch `./`, auch `<IMG SRC=…>` in Großschreibung),
  `srcset` samt Deskriptoren, `<source src>`, `<video poster>`, `<audio src>`,
  `href` am `<image>` (auch `xlink:href`) und nicht am `<a>`, `url()` im
  `style`-Attribut in beiden Zitatformen.
- CSS beidseitig: `url()` im `<style>`-Block und in der aus `src/*.css`
  eingebetteten `@font-face` — `inlineAssets` läuft bewusst zuletzt
  (`bundle.ts:220`), darum trifft es das eben entstandene `<style>` mit. In
  einer Deklaration mit zwei `url()` werden beide ersetzt.
- Medientypen: `assetDataUris` (`src/core/assetstore.ts:157`) nimmt den Typ aus
  `assetMime`; die Tabelle deckt png/jpg/webp/gif, woff2/woff/ttf/otf,
  json/csv/txt ab, SVG als base64 `data:image/svg+xml`. `UNKNOWN_MIME` kommt gar
  nicht erst in die Karte, die Referenz bleibt darum stehen — Spec
  `assetstore.spec.ts` „lässt einen unbekannten Typ aus der Karte".
- Fehlgriff ohne Fehler: `assets/fehlt.png`, `https://…/assets/logo.png` und
  `/assets/logo.png` bleiben Zeichen für Zeichen stehen, `bundle` wirft nicht;
  keine Größengrenze im Code.
- `src/`-Inlining unverändert: Bei leerer Karte kurzschließt `bundle` ganz; bei
  gefüllter Karte werden Tag und `<style>`-Kopf aus den Fängen wörtlich wieder
  zusammengesetzt, ein Attribut nur bei echter Änderung. Skript-Rümpfe und
  Kommentare bleiben unangetastet (nachgeprüft mit Markup in einem JS-String),
  `data-morphos-src` spricht nicht an (der Trenner vor dem Namen ist `[\s:]`).
- Specs: 14 neue, je Referenzform eine, dazu CSS inline + `.css`, MIME je Typ,
  fehlendes Asset, Skript-Rumpf, und in `generate.spec.ts` der Weg von der
  Platte ins Artefakt. Keine abgeschwächte, übersprungene oder `.only`-Spec im
  Diff.
- `npm test`: 2170 Tests in 101 Dateien grün. `npm run typecheck` (`vue-tsc
  --noEmit`): sauber.
- Diff bleibt im What: `bundle.ts`, `assetstore.ts`, `generate.ts`, das
  Herausziehen von `UNKNOWN_MIME` in `assets.ts`, drei Spec-Dateien. Kein
  Fremdkörper, kein Debug-Rest.
- Am Rande (kein Mangel): Die Abhängigkeit c0116 steht selbst noch in `review`.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-27 status → in-progress (agent)
- 2026-08-27 umgesetzt: bundle(files, libs, assets) + assetDataUris; 14 neue Specs (bundle, assetstore, generate), 2170 Tests grün, vue-tsc sauber.
- 2026-08-27 status → review (agent)
