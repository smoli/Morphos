---
id: e10
type: epic
title: "Framework support"
status: backlog
---

## Goal

Evaluate — and, if it pays off — give generated apps a **UI framework** so the
agent stops hand-rolling UI and state in vanilla JS for every app, without
weakening the sandbox more than necessary.

The deciding constraint is the app **CSP** (`script-src 'unsafe-inline'`, no
`'unsafe-eval'`). That splits the candidates:

- **Vue** — full templates need either a **build-time compiler** in the shell's
  bundler (CSP stays strict) or a **relaxed CSP** (`'unsafe-eval'`, spike only).
- **React / Preact** — **Preact + htm** needs **neither eval nor a build step**
  (htm parses tagged templates at runtime, no `eval`); React+JSX needs a
  build-time transform.

## Definition of done

- A recorded **decision**: adopt a framework (which one) or not, with the reason.
- If adopted: a working, **CSP-appropriate** delivery (shipped built-in, opt-in
  per app) plus system-prompt guidance and tests — no weakening of the strict CSP
  unless explicitly chosen.
- Vanilla-JS apps keep working unchanged; the framework is opt-in.

## Notes

- Spike branch `spike/vue-in-apps` relaxes the CSP to try full Vue quickly — a
  throwaway measurement, not a merge candidate.
- Preact + htm can be evaluated **without** any CSP change (works on `desktop`).
