---
id: c0119
title: "Asset-manager panel — add / remove / preview"
status: in-progress
epic: e16
depends: [c0116]
created: 2026-08-27
updated: 2026-08-28
status-changed: 2026-08-28T00:15:11
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

## Log

- 2026-08-27 created from the e16 epic breakdown.
- 2026-08-27 status → ready (app)
- 2026-08-28 status → in-progress (agent)
- 2026-08-28 core/assetview + AssetPanel gebaut, Store-Aktionen, 📦 im Fenster,
  Riegel gegen daneben fallengelassene Dateien; Suite grün (2259).
