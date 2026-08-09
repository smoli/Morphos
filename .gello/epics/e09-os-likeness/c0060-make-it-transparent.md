---
id: c0060
title: make it transparent
status: in-progress
ref: c0052
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T14:09:28
---

# make it transparent

and ad the transparency level as a setting

## What

Das Dock (c0052) scheint durch: Der Hintergrund schimmert sichtbar durch die
Leiste, statt sie nur anzudeuten. Wie stark, sagt eine Einstellung — je
Arbeitsverzeichnis, wie der Hintergrund auch.

## Acceptance criteria

- [x] Das Dock ist von Haus aus **deutlich durchsichtig** (50 %, vorher 28 %);
      sein Milchglas-Schleier bleibt.
- [x] In den Einstellungen lässt sich die **Durchsichtigkeit stufenlos** von
      deckend (0 %) bis ganz durchsichtig (100 %) einstellen.
- [x] Der Wert wirkt **sofort** und bleibt **je Arbeitsverzeichnis** über den
      Neustart erhalten (wie `wallpapers`).
- [x] Ein Knopf setzt auf die Vorgabe zurück; er ist nur da anzufassen, wo es
      etwas zurückzusetzen gibt.
- [x] Beschädigte Einstellungen fallen weg — dann gilt die Vorgabe; in die
      CSS-Angabe gerät nichts als eine geprüfte Zahl.
- [x] Rechnung und Eintüten sind reine Logik mit Unit-Tests, Regler, Vorschau
      und die Leiste selbst mit Komponententests.

## Notes

- **Gedeutet als: das Dock.** „it“ ist das Dock — die Karte hängt über `ref:` an
  c0052, und das war der letzte Stand, den der Mensch vor sich hatte. Fenster
  bleiben deckend: Hinter einer App steht kein Schreibtisch, sondern die nächste
  App, und ihr Inhalt wäre durch Glas nicht mehr zu lesen.
- **`src/core/transparency.ts`** (neu) ist die einzige Stelle, an der aus einem
  gemerkten Wert eine CSS-Angabe wird: `cleanTransparency` nimmt nur einen Anteil
  zwischen 0 und 1 an (auf ganze Prozent gerundet), sonst null; `dockBackgroundCss`
  baut daraus `rgba(20, 22, 28, α)` mit α = 1 − Wert und fällt sonst auf die
  Vorgabe zurück. 10 Unit-Tests in `transparency.spec.ts`.
- Gemerkt wird wie der Hintergrund: `dockTransparencies` je Workspace-Pfad, im
  Store (`setDockTransparency` / `resetDockTransparency`, geprüft beim Merken),
  in `Settings` und im Hauptprozess beim Lesen **und** Schreiben eingetütet.
- Der neue Einstellungs-Bereich **„Darstellung“** (`AppearanceSection.vue`, im
  Verzeichnis `sections.ts` registriert — mehr brauchte es dank c0039 nicht)
  trägt den Regler (Schritt 5 %), die Prozentzahl und eine Vorschau: dieselbe
  Leiste in klein, über dem echten Hintergrund dieses Verzeichnisses.
- Der Regler schreibt bei jedem Schritt durch (Dock und Vorschau ziehen sofort
  nach). Bei 21 Stufen sind das im schlimmsten Fall 21 kleine Schreibvorgänge je
  Zug — kein Grund für eine Bremse.
- Geprüft: `npx vitest run` (1061 Tests grün) und `npx vue-tsc --noEmit`. Ein
  Lauf in der echten Electron-App fand nicht statt (Ordnerauswahl ist ein
  nativer Dialog) — belegt ist alles über die Komponententests.

## Log

- 2026-08-09 status → in-progress (agent)
- 2026-08-09 core/transparency + Spec (rot → grün), Dock nimmt seine Farbe aus
  den Einstellungen, Vorgabe auf 50 %, neuer Bereich „Darstellung“ mit Regler
  und Vorschau
