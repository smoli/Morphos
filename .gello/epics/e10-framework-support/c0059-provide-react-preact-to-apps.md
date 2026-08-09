---
id: c0059
title: Provide React/Preact to apps (no-eval alternative)
status: in-progress
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T19:33:06
epic: e10
---

## What

**Decision: adopt Preact + htm** (over Vue / c0058 — it keeps the strict CSP with
no `'unsafe-eval'` and needs no bundler compiler; already verified CSP-clean, see
„Verified“ below).

Make it **optional per app via a toggle in the composer**, shown **only when
creating a new app**, and **on by default** — so the agent uses Preact without the
user having to ask for it in the prompt each time. When the toggle is **off**, the
app is plain vanilla JS.

The choice is **remembered per app**: follow-up edits continue in the app's
existing style (Preact if it already uses it, otherwise vanilla) without
re-toggling. Preact stays **opt-in** — apps that don't use it get nothing inlined.

Delivery is already in place (shipped built-in `preact`, inlined via
`morphos:lib content="preact"`; globals `preact` / `preactHooks` / `html`). This
card is now about the **toggle + wiring**, not the plumbing.

## Acceptance criteria

- [x] A **framework toggle** („Preact“) appears in the composer **only when
      creating a new app**, and is **on by default**.
- [x] Toggle **on** → the new app is generated **with Preact + htm** (the `preact`
      built-in is inlined and the prompt instructs the agent to build UI and state
      with Preact); **off** → plain vanilla JS, no Preact.
- [x] The framework is **remembered per app**: follow-up edits to an existing app
      continue in its style (Preact if its source already uses `preact`, otherwise
      vanilla) **without** re-toggling.
- [x] The always-on `SYSTEM_PROMPT` **no longer nags** about Preact; the Preact
      authoring guidance is added to the prompt **only when the app uses Preact**
      (new-app toggle on, or an existing app already using it).
- [x] The toggle state flows **renderer → generate → prompt** (host/preload/main
      signature carries it); generation is unchanged when off / for vanilla apps.
- [x] Preact stays **opt-in** — an app that doesn't use it gets nothing inlined.
- [x] Tests cover: the toggle shows only for a new app and defaults on; „on“
      yields Preact guidance + inlining; an existing Preact app keeps Preact on
      follow-ups; „off“ / vanilla adds nothing.

## Discussion

**Decision (2026-08-09): adopt Preact + htm; Vue (c0058) not chosen.** Preact+htm
keeps the strict CSP (no eval) and needs no bundler compiler, and it's verified
working (see „Verified“). Made **optional via a new-app toggle, on by default**, so
it's the default without prompt-nagging, and **remembered per app** for follow-up
edits. → c0058 (Vue) can be closed as not-adopted.

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
- 2026-08-09 Entscheidung: Preact übernommen; optional per Toggle beim Anlegen
  einer neuen App (Vorgabe an), pro App gemerkt. What/AC auf Umsetzung
  umgeschrieben — Implementierung durch anderen Agenten.
- 2026-08-09 status → ready (app)
- 2026-08-09 status → in-progress (agent)
