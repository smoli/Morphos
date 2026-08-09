---
id: c0059
title: Provide React/Preact to apps (no-eval alternative)
status: discuss
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T10:05:14
epic: e10
---

## What

Alternative to **c0058** (Vue): give generated apps a React-family option that
keeps the **strict CSP intact** — no `'unsafe-eval'`. Two flavors:

- **Preact + htm** — `htm` turns tagged-template literals into vnodes at runtime
  with a *parser* (no `eval`) and **no build step**; JSX-like ergonomics, ~4–5 KB.
  The cleanest fit: strict CSP untouched, no bundler compiler.
- **React (+ ReactDOM) with JSX** — needs a **build-time** JSX→`createElement`
  transform in the shell's bundler (comparable to Vue's build-time compile); no
  `eval`. Without it, plain `React.createElement` is eval-free but verbose.

Delivery: **shipped built-in** (vendored), opt-in via
`morphos:lib content="preact"` / `"react"`. Goal: compare against the Vue spike
to decide which framework story (if any) to adopt.

## Acceptance criteria

- [ ] **Preact + htm** available as a shipped built-in (opt-in via
      `morphos:lib content="preact"`), inlined when used; a sample app renders and
      updates reactively under the **unchanged strict CSP** (no `'unsafe-eval'`).
- [ ] Confirmed that htm's tagged-template rendering needs **no eval and no build
      step** (works as-is in the sandbox).
- [ ] React proper is either (a) prototyped with a **build-time JSX transform**,
      or (b) explicitly deferred in favour of Preact+htm; if React ships without
      the transform, it's the `createElement`/no-JSX form.
- [ ] `SYSTEM_PROMPT` documents the chosen authoring model (opt-in, mount
      contract, still no network/localStorage).
- [ ] A representative app is built with **Preact+htm** and compared to the Vue
      spike (c0058) and vanilla for generation quality/efficiency and output size;
      findings recorded.
- [ ] A **which-framework recommendation** is recorded across c0058 (Vue) and this
      card — adopt one, both, or neither, with the reason.
- [ ] Opt-in detection + built-in inlining covered by unit tests.

## Discussion

Motivation (2026-08-09): the React family can avoid the CSP relaxation the Vue
spike needed.

- **Preact + htm is the standout.** htm parses template literals into vnodes at
  runtime (a parser, not `eval`), so it needs **neither `'unsafe-eval'` nor a
  build-time compiler** — JSX-like and tiny. Strictly better than the Vue spike on
  the security axis (CSP stays strict) and better than Vue's build-time-compile on
  the tooling axis (no compiler to build).
- **React proper:** JSX needs a build-time transform (≈ same effort as Vue's
  build-time compile); without it, `React.createElement` works under the strict
  CSP but is verbose. So "React with nice ergonomics" costs the same bundler
  investment as Vue; "Preact+htm" gets nice ergonomics for free.
- Sits alongside c0058 as the decision set: (a) Vue via build-time compile,
  (b) Vue via relaxed CSP [spike only, branch `spike/vue-in-apps`], (c) **Preact +
  htm — no eval, no build**, (d) React + JSX build transform. Leaning: if the goal
  is CSP-clean + low tooling, (c).

Open questions:

- **State management:** Preact **signals** vs hooks vs a small store — does an app
  need more than component-local state?
- One framework story or offer **both** Vue and Preact? (Probably pick one after
  the spikes.)
- Do we build the **React+JSX transform** at all, or standardize on Preact+htm?

## Notes

- htm + Preact ship as vendored built-ins, inlined via the existing `morphos:lib`
  mechanism when opted in — **no CSP change, no compiler**.
- Contrast with c0058: that spike relaxed the CSP to get Vue templates cheaply;
  this path keeps the CSP strict. Cross-reference both when deciding.

## Verified (tryout on `desktop`, 2026-08-09, commit 9a76f4e)

Preact + htm stood up on `desktop` as a built-in (opt-in via
`<meta name="morphos:lib" content="preact">`); the strict CSP was **not** touched.

- **Confirmed CSP-clean:** a real Preact+htm app (a `useState` counter, `html`
  tagged templates) rendered **and reacted** to clicks under
  `script-src 'unsafe-inline'` with **no `'unsafe-eval'`** — checked in the browser,
  **zero console/CSP errors**. htm needs no eval and no build step, as expected.
- **Delivery:** `main.ts` inlines the vendored UMD builds (preact + hooks + htm,
  ~16 KB raw) plus glue exposing globals `preact`, `preactHooks`, `html`;
  `SYSTEM_PROMPT` documents the authoring model.
- **Cost:** ~16 KB inline per opted-in app; non-Preact apps unaffected.
- **Open for the go/no-go:** whether Preact+htm output actually improves the LLM's
  generation vs vanilla (and vs the Vue spike) — needs real generations to judge.

## Log

- 2026-08-09 created as the React/Preact counterpart to c0058 (no-eval path)
- 2026-08-09 moved e0002 → e10 (framework-support epic)
- 2026-08-09 Preact+htm als eingebaute Bibliothek auf desktop erprobt (9a76f4e);
  im Browser verifiziert: rendert + reagiert unter strikter CSP, keine eval-/CSP-
  Verletzung. Ergebnis in „Verified“ festgehalten.
