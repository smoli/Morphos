---
id: c0073
title: Mark UI elements and Discuss
status: discuss
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T19:46:11
epic: e0004
---

## What

A **pick mode**: the user toggles it (🎯), hovers to highlight and **clicks a UI
element** in the running app, and that element becomes a **reference chip** in the
composer — so the next prompt can say „mach **das** größer“. The reference is a
**structured description** (tag, id/classes, text, a CSS selector/DOM path) and,
where the element comes from statically-authored markup, an **exact source
location** injected at bundle time (`data-morphos-src`), so the LLM edits the
right spot. Works **framework-agnostic** (any rendered DOM); several elements can
be marked.

## Acceptance criteria

- [ ] A **🎯 pick-mode toggle** (window title bar / composer) enters/exits pick
      mode; in it, hovering an element in the app **highlights** it and clicking
      **captures** it; **Esc** / toggle exits.
- [ ] A picked element becomes a **reference chip** in the composer (beside
      attachments), recognizably labelled (tag + text); several can be added and
      removed individually.
- [ ] The reference carries a **structured description**: tag, id, classes, text
      content, a stable-ish **CSS selector / DOM path**, and size/position.
- [ ] The bundler injects **`data-morphos-src`** on statically-authored markup
      (elements from `src/index.html` and linked source), giving a picked element
      an **exact source location** (file + position) when available.
- [ ] The next prompt includes each marked element as **context**
      („referenziertes Element“) — the source location when present, else the
      description — so the LLM can locate and change it.
- [ ] The picker runs as an **injected script inside the sandboxed iframe** (like
      the `morphosFS` bridge) over `postMessage`; it adds **no** new capability and
      doesn't weaken the sandbox/CSP.
- [ ] Works on **any rendered DOM** (vanilla and Preact); where a source tag is
      absent (runtime-generated DOM), it falls back to the description.
- [ ] Pure pieces (selector building, `data-morphos-src` injection in the bundler,
      reference formatting for the prompt) are covered by **unit tests**.

## Discussion

Decisions (interviewed 2026-08-12):

- **Structured description** as the reference payload (selector / text / attrs /
  position), not a screenshot crop — cheap, and it's what points the LLM at
  source. Rejected visual crop (needs iframe region-capture and doesn't say *where*
  in the source).
- **Pick-mode toggle → reference chips** in the composer; several markable, Esc
  exits. Rejected one-shot single-pick.
- **Build-time source tags** (`data-morphos-src`) for **exact** mapping — the
  bundler annotates statically-authored markup so a picked element maps to its
  source location; the description stays as the fallback.
- **Framework-agnostic** — the picker reads the DOM, so it works in vanilla and
  Preact apps alike.

Open questions for planning:

- **Coverage of source tags:** `data-morphos-src` is straightforward for markup in
  `src/index.html`. **Runtime-generated DOM** — `document.createElement` and
  **htm/Preact** templates — has no build-time tag and relies on the descriptive
  fallback. Tagging htm/JS templates (a source transform) is a harder extension —
  v1 or later?
- **Selector stability:** how robust the generated CSS path must be (id/class
  heuristics vs `nth-child`).
- **Highlight UX** inside the sandboxed app (an outline overlay the injected script
  draws) — and keeping it out of the app's own screenshots.
- Does a reference also flow into the **per-window chat context** like attachments,
  or only the immediate next prompt?
- **Size:** moderate (injected picker + bundler tagging + composer chips + prompt
  context) — a candidate for /gello-plan, though buildable as one card.

## Notes

- Mirrors the existing bridge/attachment plumbing: an injected picker script (cf.
  `core/appfs` `BRIDGE_SDK`) posts the element description; the composer holds
  element-reference chips beside file attachments; the prompt gains a
  „referenziertes Element“ section (cf. how references/docs enter `core/prompt`).
- The `data-morphos-src` annotator belongs in `core/bundle` (where the markup is
  already processed) as a pure, tested step.

## Log

- 2026-08-12 status → discuss (app)
