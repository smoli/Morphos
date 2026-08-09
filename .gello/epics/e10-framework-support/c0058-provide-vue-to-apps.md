---
id: c0058
title: provide vue to apps
status: discuss
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T09:38:42
epic: e10
---

## What

**Prototype** giving generated apps **Vue** (components with `<template>`) and
**Pinia**, made CSP-safe by **compiling templates at bundle time**: the LLM
authors Vue source under `src/`, the shell's bundler runs Vue's compiler to
produce **render functions**, and inlines the **runtime-only** Vue build (no
runtime compiler → no `eval`, so the strict CSP stays intact). Vue/Pinia are
**shipped built-in** (a vendored, known-good build), opt-in per app.

Goal: build the pipeline far enough to try it on real apps and **decide** whether
Vue actually makes generation better — a go/no-go, not a blanket commitment.

## Acceptance criteria

- [ ] The bundler compiles app-authored Vue **templates → render functions** at
      bundle time (`@vue/compiler-*` in the main process); no runtime template
      compilation.
- [ ] A **runtime-only** Vue build (and Pinia) is **shipped with Morphos** and
      inlined into the bundle **only when the app opts in**; non-Vue apps are
      unaffected.
- [ ] The result runs under the **unchanged strict CSP** (no `'unsafe-eval'`); a
      sample Vue app renders and updates reactively in the sandbox.
- [ ] The app **opts in** via a clear, documented mechanism (e.g.
      `morphos:lib content="vue"` or `.vue` files under `src/`) — decided and
      documented.
- [ ] A **template/SFC compile error** surfaces as a normal generation error (no
      silent failure), like an invalid `index.html`.
- [ ] `SYSTEM_PROMPT` gains a short „eine Vue-App für Morphos schreiben“ section
      (authoring model, mount contract, still no network/localStorage).
- [ ] **Two representative apps** are built both ways (Vue vs vanilla) and
      compared for generation quality/efficiency and output size; the finding is
      written into this card.
- [ ] A **go/no-go recommendation** is recorded — adopt (spin the real cards) or
      drop, with the reason.
- [ ] Bundler compile step + opt-in detection covered by unit tests.

## Discussion

Decisions (interviewed 2026-08-09):

- **Full Vue via build-time compile** — not reactivity-only, not relaxed CSP. The
  LLM writes templates/components; the shell precompiles to render functions and
  ships **runtime-only** Vue, so the strict CSP (no `eval`) is untouched. Rejected
  reactivity-only (no template ergonomics) and `'unsafe-eval'` (weakens the
  sandbox for every app).
- **Shipped built-in** — a deliberate exception to the earlier „no vendored libs,
  whitelist only“ rule, because the shell must control the exact Vue build; a CDN
  build can pull in the runtime compiler (eval) and break under the CSP.
- **Prototype first** — this card proves the pipeline and measures whether Vue
  improves generation before committing; it ends in a go/no-go.

Open questions:

- **SFC** (`.vue` + `<script setup>` + `<style>`) vs plain template strings — how
  much of the authoring surface the prototype supports.
- **Bundle size**: inlining the runtime (~tens of KB) per Vue app — acceptable?
- **Opt-in signal** and the **mount contract** in `src/index.html`.
- Does it really help, or does template/render output cost the LLM more than
  vanilla? (the thing to measure.)

## Notes

- Compilation runs where bundling already runs (main process, `core/bundle` + a
  new compile step); `.vue`/templates are just `src/` files in the existing
  file-block protocol, so incremental edits and path validation are unaffected.
- Pinia is plain runtime JS (reactivity + a registry) — CSP-safe; ship alongside
  Vue.

## Log

- 2026-08-09 status → discuss (app)
- 2026-08-09 moved e0002 → e10 (framework-support epic)
