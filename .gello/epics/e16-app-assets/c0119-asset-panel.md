---
id: c0119
title: "Asset-manager panel — add / remove / preview"
status: review
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-28
status-changed: 2026-08-28T00:28:38
usage-tokens: 68353
usage-cost: 7.603937
---

# Asset-manager panel — add / remove / preview

## What

The user-facing surface for managing an app's assets: a shell panel that lists
the app's `assets/` (name, type, size), adds files (file picker and/or
drag-drop) by copying them into `assets/` through the c0116 storage ops,
previews the selected asset, and removes one. Removing an asset that code still
references degrades gracefully (the broken reference is left as-is, no crash).

## Acceptance criteria

- [x] A panel lists the app's assets with name, type and size.
- [x] Adding via a file picker copies the chosen file(s) into `assets/`.
- [x] Drag-and-drop of files onto the panel/app adds them to `assets/`.
- [x] Selecting an asset previews it (image preview; a sensible generic view for
      fonts/data).
- [x] Removing an asset deletes it; removing one still referenced by code does
      not crash the app or the shell.
- [x] Specs cover list, add (picker and drop), preview and remove.

## Notes

Depends on the c0116 storage model/ops. New UI (the existing `ExplorerPanel`
shows the runtime data folder, not app source). Follow the shell's existing
panel and drag-drop patterns. **No size cap in v1** — do not reject files by
size at add time (decided 2026-08-27).

**Gebaut (2026-08-28)**

- `src/core/assetview.ts` — die Regeln der Verwaltung, rein und renderer-tauglich
  (wie `core/assets` neben `core/assetstore`): `assetView` (Bild/Schrift/Ton/
  Video/Daten/Datei am Medientyp), `assetIcon`, `assetTypeLabel` („Bild · PNG“ —
  Art aus dem Medientyp, Format aus der Endung), `assetDataUri`,
  `base64FromDataUri`, `assetText` (base64 → Text, gekappt bei 64 KB) und
  `assetUsers` (welche Quelldateien eine Beigabe verwenden). Bewusst NICHT
  `previewKind` aus `core/preview`: Dort muss SVG in die Sandbox, weil eine
  fremde Datei aktiv sein kann; ein Asset wird als `<img src="data:…">` gezeigt,
  wo auch ein SVG kein Skript ausführt — und Schriften kennt jene Tabelle nicht.
- `src/components/AssetPanel.vue` — der Panel selbst, im Fenster neben
  Versionen und Dokumenten (📦 in der Titelleiste, nur bei einer bestehenden
  App). Liste mit Name, Typ und Größe; „Dateien wählen …“ (mehrfach) und
  Fallenlassen auf den Panel; Vorschau des Gewählten; Entfernen nach Rückfrage.
  Die Bytes holt er EINZELN beim Anklicken — im Fenster liegt nur die Auskunft.
- Vorschau je Art: Bild als `data:`-URI, Ton/Video mit Bedienelementen,
  Datendateien als gekappter Text, Schriften und alles Übrige als Angaben zur
  Datei (Zeichen, Name, Typ, Größe). Ein überholtes Lesen wird verworfen
  (Zähler), sonst stünde der Inhalt der einen Datei unter dem Namen der anderen.
- Der Panel bekommt `read`/`add`/`remove` als FUNKTIONEN statt Ereignisse (wie
  `authorize` in AppCanvas): Ablegen und Entfernen sind je ein Commit, und ob er
  gelingt, gehört an die Stelle, an der es dem Anwender hingeschrieben wird.
- Store (`stores/app`): `refreshAssets`, `addAsset`, `removeAsset`, `readAsset`.
  Die neue Datei wird unter dem Namen einsortiert, den der Hauptprozess vergeben
  hat (zurechtgerückt/hochgezählt) — und einsortiert wie auf der Platte, nach
  Namen. Beim Aufklappen liest der Panel die Liste frisch: Ein Revert holt
  Assets mit zurück, sie liegen im selben Commit.
- Entfernen warnt, wenn der Code die Datei noch verwendet („Wird noch verwendet
  in src/index.html“), verhindert aber nichts. Danach bleibt die Referenz stehen
  und läuft ins Leere: `bundle` lässt sie unangetastet (c0117, Spec „lässt ein
  fehlendes oder fremdes Asset unangetastet und wirft nicht“), ein am Wunsch
  hängender Pfad fällt in `pickAssets` weg — nichts stürzt ab.
- `src/core/drop.ts` + Aufruf in `src/main.ts`: Riegel gegen daneben
  fallengelassene Dateien. Erst mit diesem Panel zieht der Anwender Dateien über
  die Schale, und ohne den Riegel LÄDT Chromium die danebengefallene Datei als
  Seite — der ganze Desktop wäre weg. Das Fenster ist ganz außen, wer die Datei
  annehmen will, ist zuerst dran.
- `ChatDock` nimmt sein Zeichen jetzt aus `core/assetview` statt aus einer
  eigenen Kopie; die drei Ansichten im Fenster (Versionen, Dokumente, Beigaben)
  teilen sich einen Zustand statt paarweisem Ausschließen.

Specs: `src/core/assetview.spec.ts` (17), `src/components/AssetPanel.spec.ts`
(20 — Liste, Wählen, Fallenlassen, Vorschau je Art samt überholtem Lesen,
Entfernen mit Rückfrage und Warnung), `src/core/drop.spec.ts` (3), dazu 10 im
Store und 5 in `AppWindow.spec.ts`. Ganze Suite grün (2259), `vue-tsc` sauber.

## Review

### 2026-08-28T00:30:59 — pass

Checked: die sechs Akzeptanzkriterien am Code, die Specs, `npm test`, `npm run
typecheck`, den Diff von 6ea268a.

- Kriterium „Liste mit Name, Typ und Größe“: `AssetPanel.vue` zeigt je Zeile
  `asset.name`, `assetTypeLabel` („Bild · PNG“, aus Medientyp + Endung) und
  `formatBytes(asset.size)`; belegt in `AssetPanel.spec.ts` („führt jede Beigabe
  mit Namen, Typ und Größe auf“).
- Kriterium „Dateiwähler“: `pickFiles`/`onPicked` → `addFiles` liest jede Datei
  per `FileReader` nach base64 und ruft `add(name, data)`; der Weg zur Platte ist
  durchgezogen (`stores/app.addAsset` → `morphos:addAsset` in `electron/preload.ts:134`
  → `electron/main.ts:1204`, `Buffer.from(data,'base64')`). Mehrfachwahl
  nacheinander, ein Fehlschlag hält die übrigen nicht auf — beides getestet.
- Kriterium „Drag-and-drop“: `@drop.prevent="onDrop"` führt in dasselbe
  `addFiles`; Spec „nimmt fallengelassene Dateien genauso auf“ und ein leerer Zug
  ohne Wirkung.
- Kriterium „Vorschau“: `assetView` entscheidet je Medientyp — Bild/Ton/Video als
  `data:`-URI, Datendateien als bei 64 KB gekappter Text, Schrift und Übriges als
  Angaben zur Datei. Specs decken Bild, Text, Schrift, unlesbare Datei und das
  überholte Lesen (`readSeq`) ab; die Bytes kommen einzeln über `readAsset`, die
  Liste bleibt bytefrei.
- Kriterium „Entfernen, auch wenn noch referenziert“: `confirmRemove` →
  `store.removeAsset` → `morphos:removeAsset`; `assetUsers` warnt nur
  („Wird noch verwendet in src/index.html“) und sperrt nichts. Die stehen
  bleibende Referenz bricht nichts: `pickAssets` lässt fehlende Pfade weg
  (`assetstore.spec.ts:239`), `bundle` lässt sie unangetastet (c0117). Die
  Vorschau räumt sich mit weg, wenn die gezeigte Beigabe aus der Liste fällt.
- Kriterium „Specs decken Liste, Wählen, Fallenlassen, Vorschau, Entfernen“:
  20 in `AssetPanel.spec.ts`, 17 in `assetview.spec.ts`, 10 im Store, 5 in
  `AppWindow.spec.ts`, 3 in `drop.spec.ts` — alle vorhanden und aussagekräftig,
  kein `.only`, kein `skip`, nichts abgeschwächt.
- Checks: `npm test` grün (104 Dateien, 2259 Tests), `npm run typecheck`
  (`vue-tsc --noEmit`) sauber. Ein Lint-Skript gibt es in diesem Repo nicht
  (`package.json` kennt nur dev/build/start/test/typecheck) — insofern nicht
  ausgeführt.
- Diff bleibt im What: Panel, `core/assetview`, Store-Aktionen, 📦 im Fenster.
  Zwei Zugaben sind gedeckt: `core/drop` + `src/main.ts` ist der Riegel, den
  erst dieses Fallenlassen nötig macht (ohne ihn lüde Chromium die daneben
  gefallene Datei als Seite), und die drei Überlagerungen in `AppWindow.vue`
  teilen sich statt paarweisem Ausschließen nun einen `overlay`-Zustand.
- Zwei Kleinigkeiten ohne Belang für die Kriterien, für später: eine Datei mit
  0 Bytes wird beim Ablegen als „leer oder ließ sich nicht lesen“ abgewiesen,
  und `.asset-remove` ist ein `<span role="button">` in einem `<button>` — für
  die Tastatur nicht erreichbar.

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-28 status → in-progress (agent)
- 2026-08-28 core/assetview + AssetPanel gebaut, Store-Aktionen, 📦 im Fenster,
  Riegel gegen daneben fallengelassene Dateien; Suite grün (2259).
- 2026-08-28 status → review (agent)
