---
id: c0118
title: "Per-wish asset attach — stored assets into the prompt"
status: in-progress
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-28
status-changed: 2026-08-28T00:00:42
---

# Per-wish asset attach — stored assets into the prompt

## What

Let the user point the agent at a stored asset for a specific wish. The user can
attach one or more assets that already live in `assets/` to a wish; `buildPrompt`
then names each attached asset by its **in-app path** `assets/<name>` so the
agent can wire it into the code. This is distinct from today's transient
`Attachment` (an absolute path from the native dialog, not stored in the app).

**Simpler than transient attachments (decided):** the agent's working directory
IS the app folder, so an attached image asset is `Read`-able at its plain
relative path (`assets/logo.png`) — no absolute-path plumbing like
`main.ts` does for dialog-chosen images. The prompt just says "here is
`assets/<name>`; `Read` it if you need to see it."

## Acceptance criteria

- [x] A wish can attach one or more STORED assets (chosen from the app's
      `assets/`).
- [x] The prompt lists each attached asset with its in-app path `assets/<name>`.
- [x] Image assets are `Read`-able via that same relative path (no absolute path
      passed) — the working dir is the app folder.
- [x] Stored-asset attachments are visually distinct from and coexist with the
      existing transient `Attachment` flow.
- [x] The attachment is recorded on the chat message for display (like today's
      attachment names).
- [x] Specs cover the prompt formatting for a stored-asset attach (path listed;
      image Read-able) alongside existing attachment behaviour.

## Notes

Depends on the c0116 storage model (needs the list of stored assets and their
paths). Extends `core/prompt` (`buildPrompt`) and the composer's attach flow.
Read-only for the agent — it references the asset, never writes it.

### Umsetzung

Der Weg eines mitgeschickten Assets, von unten nach oben:

- **`core/prompt`** — `PromptContext.assets?: AssetInfo[]` und `formatAssets()`
  (wie `formatDesign` eigens prüfbar). Der Abschnitt `MITGESCHICKTE BEIGABEN DER
  APP` nennt jede Beigabe mit ihrem in-App-Pfad, ihrem Medientyp und dem, was
  mit ihr zu tun ist: Ein **Bild** ist mit `Read` unter `assets/<name>`
  anzusehen (kein absoluter Pfad — das Arbeitsverzeichnis IST der App-Ordner),
  eine **Schrift** gehört in `url(assets/…)`, eine **Datendatei** wird gelesen
  und ihr Inhalt in den Code übernommen (JS-Zeichenketten rührt das Bündeln
  nicht an). Im `SYSTEM_PROMPT` steht dafür der Abschnitt `BEIGABEN DER APP`;
  harte Regel 1 („nur data:-URI“) nimmt den Verweis auf `assets/…` nun
  ausdrücklich aus — sonst hätte der Agent sich nicht getraut, ihn zu setzen.
- **`core/assetstore: pickAssets(dir, wanted)`** — macht aus der Auswahl das,
  was wirklich im Asset-Ordner liegt: Unbekanntes fällt weg, Doppeltes auch, und
  ein Pfad, der aus dem Ordner führte, war nie einer (Prüfung am Namen).
- **`core/generate`** — `GenerateRequest.assets?: string[]`; aufgelöst wird
  gegen die Platte, genau wie der UI-Entwurf. Ein Entwurf hat noch keine.
- **Schale** — `morphos:generate` nimmt die Pfade entgegen, der App-Store
  schickt sie mit dem Wunsch und vermerkt sie an der Nachricht des Anwenders
  (`ChatMessage.assets`, getrennt von `attachments`); die Warteschlange trägt
  sie am Auftrag mit, damit ein Wunsch auch ohne sein Fenster ankommt.
- **Composer** — der Knopf 📦 erscheint nur, wenn die App Beigaben hat, und
  klappt die Auswahl auf; gewählte stehen als eigenes Kärtchen (grüne Kante,
  📦) neben den Referenzdateien 📎/🖼 und den markierten Elementen 🎯.

Geprüft: 2204 Tests grün, `vue-tsc --noEmit` sauber (einen Lint-Schritt hat das
Repo nicht).

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-28 status → in-progress (agent)
