---
id: c0118
title: "Per-wish asset attach — stored assets into the prompt"
status: review
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-28
status-changed: 2026-08-28T00:13:08
usage-tokens: 55274
usage-cost: 9.89318
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

## Review

### 2026-08-28T00:14:34 — pass

Checked: alle sechs Akzeptanzkriterien am Code, `npm test`, `npm run typecheck`,
der Diff von `ee45383` (einen Lint-Schritt hat das Repo nicht — `package.json`
kennt nur `test`, `test:watch`, `typecheck`).

- „Ein Wunsch kann eine oder mehrere GESPEICHERTE Beigaben anhängen": `ChatDock.vue`
  (`attachAsset`/`pickedAssets`, Knopf 📦 nur bei `assets?.length`) hängt mehrere an
  und lässt keine doppelt zu; gedeckt von „hängt auch mehrere an — und dieselbe nur
  einmal" in `ChatDock.spec.ts`.
- „Der Prompt nennt jede Beigabe mit `assets/<name>`": `formatAssets()` in
  `core/prompt.ts` setzt den Abschnitt `MITGESCHICKTE BEIGABEN DER APP` mit
  `- <path> (<mime>) — <hint>`; gedeckt in `prompt.spec.ts` und end-to-end in
  `generate.spec.ts`. Ohne Beigaben bleibt der Abschnitt weg (beide Ebenen geprüft).
- „Bilder unter demselben relativen Pfad `Read`-bar, kein absoluter Pfad":
  `generate.ts:246` startet den Agenten mit `cwd: dir`, und der Beigaben-Zweig
  rührt `--add-dir` nicht an (nur `context.attachments` tut das). Der Test „gibt
  dem Agenten für ein Bild KEINEN Ordner frei" prüft beides; `prompt.spec.ts`
  prüft zusätzlich, dass im Prompt kein `/tmp|/Users|/home`-Pfad auftaucht.
- „Sichtbar unterscheidbar von und nebeneinander mit dem transienten `Attachment`":
  eigenes Kärtchen `.asset-chip` (📦, grüne Kante) neben `.chip` (📎/🖼), eigener
  Knopf, eigene Aufklappliste; der Test „hält Beigabe und Referenzdatei
  auseinander" schickt beide zusammen ab und prüft beide Wege im `submit`.
- „An der Nachricht des Anwenders vermerkt": `ChatMessage.assets` (getrennt von
  `attachments`), gesetzt in `stores/app.ts` und gezeichnet als `.att-asset`;
  gedeckt in `app.spec.ts` und `ChatDock.spec.ts`.
- „Specs decken die Prompt-Formatierung ab": 8 neue Fälle in `prompt.spec.ts`,
  5 in `generate.spec.ts`, 6 in `assetstore.spec.ts` (u. a. „führt aus dem
  Asset-Ordner nicht hinaus" — `pickAssets` prüft am Namen, `assets/../app.json`
  und ein absoluter Pfad fallen weg).
- `npm test`: 2204 Tests in 101 Dateien grün. `npm run typecheck` (`vue-tsc
  --noEmit`): sauber. Kein Test abgeschwächt — die Änderungen in
  `AgentsIndicator.spec.ts`, `TelemetrySection.spec.ts`, `DesktopView.spec.ts`
  und `AppWindow.spec.ts` sind ausschließlich das neue `assets: []` am `AgentJob`
  bzw. das dritte `submit`-Argument. Kein `.only`, kein `.skip`, kein
  übriggebliebenes `console.log`.
- Der Diff bleibt im „What": Prompt, Auflösung gegen die Platte, Durchreichen
  über Brücke und Stores, Composer-Auswahl. Der Agent bekommt die Beigaben nur
  zum Lesen genannt; geschrieben wird nichts.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-28 status → in-progress (agent)
- 2026-08-28 status → review (agent)
