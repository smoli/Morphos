---
id: c0117
title: "Bundle inlining — assets/ references as data: URIs"
status: ready
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-27
status-changed: 2026-08-27T23:29:04
order: 20
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

- [ ] `bundle` accepts an asset map `Record<relPath, dataURI>` (like `libs`);
      `generate.ts` builds it from disk before calling `bundle`.
- [ ] One resolver inlines every reference form: `<img src>`, `srcset`,
      `<video>/<audio>/<source>` `src`, `poster`, SVG `<image href>`, inline
      `style="…url()"` attributes.
- [ ] `bundle` inlines CSS `url(assets/…)` in both inline `<style>` blocks and
      bundled `src/*.css`, covering `@font-face` fonts.
- [ ] The `data:` URI carries the correct MIME per type: image
      (png/jpg/webp/gif), font (woff2/woff/ttf/otf), data (json/csv/txt); SVG as
      a base64 `data:image/svg+xml` URI; unknown type → reference left untouched.
- [ ] An absent/unresolved `assets/…` reference is left byte-for-byte untouched
      and never throws; no size cap.
- [ ] Existing `src/` CSS/JS/lib inlining is unchanged.
- [ ] Specs cover each reference form, the CSS `url()` path (inline + `.css`),
      per-type MIME, and the missing-asset case.

## Notes

Depends on the c0116 storage model (needs `readAsset` bytes to build the asset
map). Implements the resolved broad-coverage decision. Keep the resolver a
single function so the (already broad) set of forms stays easy to extend. No
size cap in v1 — accepted `data:`-URI bloat, revisit only if repos get heavy.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
