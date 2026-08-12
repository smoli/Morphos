---
id: c0073
title: Mark UI elements and Discuss
status: review
created: 2026-08-12
updated: 2026-08-12
status-changed: 2026-08-12T20:22:04
epic: e0004
commit: db6cc84
usage-tokens: 8969
usage-cost: 1.557137
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

- [x] A **🎯 pick-mode toggle** (window title bar / composer) enters/exits pick
      mode; in it, hovering an element in the app **highlights** it and clicking
      **captures** it; **Esc** / toggle exits.
- [x] A picked element becomes a **reference chip** in the composer (beside
      attachments), recognizably labelled (tag + text); several can be added and
      removed individually.
- [x] The reference carries a **structured description**: tag, id, classes, text
      content, a stable-ish **CSS selector / DOM path**, and size/position.
- [x] The bundler injects **`data-morphos-src`** on statically-authored markup
      (elements from `src/index.html` and linked source), giving a picked element
      an **exact source location** (file + position) when available.
- [x] The next prompt includes each marked element as **context**
      („referenziertes Element“) — the source location when present, else the
      description — so the LLM can locate and change it.
- [x] The picker runs as an **injected script inside the sandboxed iframe** (like
      the `morphosFS` bridge) over `postMessage`; it adds **no** new capability and
      doesn't weaken the sandbox/CSP.
- [x] Works on **any rendered DOM** (vanilla and Preact); where a source tag is
      absent (runtime-generated DOM), it falls back to the description.
- [x] Pure pieces (selector building, `data-morphos-src` injection in the bundler,
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

Open questions — decided while building (2026-08-12):

- **Coverage of source tags:** v1 tags only `src/index.html` (statically-authored
  markup). Runtime-generated DOM — `document.createElement` and **htm/Preact**
  templates — keeps the descriptive fallback; the prompt says so explicitly
  („kein Quell-Tag … finde die Stelle über Selektor und Text“). A source
  transform for htm/JS templates stays a later extension.
- **Selector stability:** id first (`#id`, only if unique and a plain name — it
  ends the path), otherwise `tag` + up to two „sane“ classes (hash-looking ones
  dropped) plus `:nth-of-type` only when same-tag siblings exist. Robust enough
  to survive re-renders, precise enough to be unique.
- **Highlight UX:** a `position: fixed`, `pointer-events: none` overlay the
  injected script draws in the app's own document (there is no other surface in
  a sandboxed iframe), plus a crosshair cursor. Screenshots are not a topic yet
  — Morphos takes none of the app; the overlay disappears with pick mode.
- **Chat context:** a reference belongs to the **immediate next prompt** only,
  exactly like an attachment — it is a deictic gesture („das da“), not a lasting
  property of the dialogue. What went along stays visible in the history
  (🎯-Kärtchen at the user message).
- **Size:** built as one card, no /gello-plan needed.

## Notes

- Mirrors the existing bridge/attachment plumbing: an injected picker script (cf.
  `core/appfs` `BRIDGE_SDK`) posts the element description; the composer holds
  element-reference chips beside file attachments; the prompt gains a
  „referenziertes Element“ section (cf. how references/docs enter `core/prompt`).
- The `data-morphos-src` annotator belongs in `core/bundle` (where the markup is
  already processed) as a pure, tested step.

Umgesetzt (2026-08-12):

- **`src/core/pick.ts`** (neu) — `PICKER_SDK` (das in die App injizierte
  Picker-Skript, Protokoll `{__morphosPick: 'mode' | 'picked' | 'exit'}`),
  `injectPicker`, `sanitizeRef`/`sanitizeRefs` (die Beschreibung kommt aus
  generiertem Code — geprüft und gedeckelt, `MAX_ELEMENT_REFS = 8`),
  `refKey`/`refLabel` fürs Kärtchen und `formatElementRefs` für den Prompt.
- **`src/core/bundle.ts`** — `annotateSource(html, path)` schreibt jedem statisch
  geschriebenen Element `data-morphos-src="src/index.html:zeile:spalte"` ins Tag;
  Kopf/Metadaten, Kommentare und der Inhalt von `<script>`/`<style>` bleiben außen
  vor (htm-Templates werden also nicht angefasst). Läuft VOR dem Einbetten, damit
  die Orte auf die Quelldatei zeigen.
- **`src/core/prompt.ts`** — Abschnitt „REFERENZIERTE ELEMENTE“ vor den
  Dokumenten; der Systemprompt erklärt Quellorte und verbietet, `data-morphos-src`
  selbst zu schreiben (es entsteht erst beim Bündeln).
- **AppCanvas** injiziert den Picker (CSP zuerst), schaltet den Modus per
  `postMessage` in den iframe (auch nach jedem Neuladen) und reicht geprüfte
  Referenzen nach oben. **ChatDock** bekommt den 🎯-Knopf und die Kärtchen,
  **AppWindow** hält Modus und Liste; von dort geht alles durch
  `stores/agents` → `stores/app` → IPC → `electron/main` in den Prompt.
- Nicht von Hand in der laufenden Electron-App durchgespielt; abgedeckt sind
  1414 Tests, darunter das Picker-Skript, das im Test über einem echten DOM
  ausgeführt wird (`src/core/pick.spec.ts`).

## Log

- 2026-08-12 status → discuss (app)
- 2026-08-12 status → ready (app)
- 2026-08-12 status → in-progress (agent)
- 2026-08-12 status → review (agent)
- 2026-08-12 umgesetzt in db6cc84 (agent)
