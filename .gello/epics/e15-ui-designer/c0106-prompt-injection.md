---
id: c0106
title: "Prompt injection — UI-LAYOUT section when design exists"
status: review
epic: e15
depends: [c0104]
created: 2026-08-16
updated: 2026-08-17
status-changed: 2026-08-17T07:02:18
usage-tokens: 30199
usage-cost: 2.397228
---

# Prompt injection — UI-LAYOUT section when design exists

## What

Teach the agent to follow the design. Extend `buildPrompt` (and the
`SYSTEM_PROMPT` in `core/prompt.ts`) plus the generation path (`core/generate`)
so that when `design.ui.json` exists, the prompt automatically carries a
`UI-LAYOUT` section describing the block tree — each block's name, role/type,
geometry, instructions, and nesting — with a clear statement that the design is
authoritative and read-only (the agent follows it but never writes the file).

## Acceptance criteria

- [x] `buildPrompt` emits a `UI-LAYOUT` section (like the marked-elements
      section) only when a design is present and non-empty.
- [x] The block tree is rendered as readable, indented text (name, type,
      rect, instructions, children).
- [x] The system prompt explains the design file's meaning and the read-only
      contract (agent must not edit `design.ui.json`).
- [x] `core/generate` reads the design and passes it into `buildPrompt`.
- [x] `prompt.spec.ts` covers presence, absence, and nesting rendering.

## Notes

Independent of the editor — depends only on the c0104 model. Follow the
existing `formatElementRefs`/attachments section style in `core/prompt.ts`.

**Umsetzung.** `formatDesign(design?)` in `core/prompt.ts` — gleiche Bauart wie
`formatElementRefs` (Zeilen-Array, leer = kein Abschnitt). `PromptContext`
bekommt `design?: Design`; `buildPrompt` setzt den Abschnitt vor die markierten
Elemente (der Aufbau gilt für den ganzen Lauf, die Markierung nur für den
Wunsch). Der Renderer wohnt in `prompt.ts` statt in `design.ts`, weil er reine
Prompt-Sprache ist; nur `DESIGN_FILE` und die Typen kommen von dort.

Gerendert wird ein eingerückter Baum — die Einrückung IST die Schachtelung:

```
- Kopfzeile [header]
  Fläche: waagerecht 0%…100%, senkrecht 0%…12%
  Anweisungen: Titel links, Suche rechts
  - Suchfeld [eingabe]
    Fläche: waagerecht 62%…97%, senkrecht 2%…10%
```

Die Anteile (0…1) stehen als **Prozent** im Prompt, auf eine Nachkommastelle —
`0.125` liest sich als `12.5%`, und der Kopf des Abschnitts sagt ausdrücklich,
dass auch die Maße eines eingerückten Kastens sich auf das ganze Fenster
beziehen (die absolute Geometrie aus c0104). Mehrzeilige Anweisungen werden
mitgerückt, ein namenloser Block heißt „(ohne Namen)“.

`core/generate` liest den Entwurf mit `readDesign(dir)` von der Platte und
überschreibt damit ein etwaiges `design` aus dem übergebenen Kontext — der
Entwurf liegt im App-Ordner, der Renderer soll ihn nicht mitschicken müssen
(Test „nimmt den Entwurf von der Platte“).

Der Systemprompt-Abschnitt „DER UI-ENTWURF (optional)“ nennt drei Dinge: der
Entwurf ist verbindlich, die Maße sind Anteile (relativ umsetzen: Prozent,
Grid, Flexbox — Ränder und Feinschliff bleiben Sache des Agenten), und
`design.ui.json` ist NUR ZUM LESEN. Bei Widerspruch zum Wunsch gilt der Wunsch,
und der Agent sagt es in seiner Mitteilung.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 `formatDesign` + `UI-LAYOUT`-Abschnitt in `core/prompt.ts`,
  `readDesign` in `core/generate`; 9 neue Tests (prompt/generate), volle Suite
  1820 grün, `vue-tsc` sauber.
- 2026-08-17 status → in-progress (agent)
- 2026-08-17 status → review (agent)
