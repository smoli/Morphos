---
id: c0061
title: Add a setting for frostyness as well
status: review
ref: c0060
epic: e09
created: 2026-08-09
updated: 2026-08-09
status-changed: 2026-08-09T14:32:57
---

# Add a setting for frostyness as well

## What

Neben der Durchsichtigkeit (c0060) lässt sich am Dock auch der **Milchglas-
Schleier** einstellen: wie stark das Dock verwischt, was hinter ihm liegt.
Von klarem Glas (0 px, der Hintergrund steht scharf dahinter) bis dicht
mattiert. Wie die Durchsichtigkeit gilt der Wert je Arbeitsverzeichnis.

## Acceptance criteria

- [x] In den Einstellungen (Bereich „Darstellung“) lässt sich der
      **Milchglas-Schleier stufenlos** von klar (0 px) bis dicht (30 px)
      einstellen; die Vorgabe ist der bisherige Wert (14 px).
- [x] Der Wert wirkt **sofort** auf Dock und Vorschau und bleibt **je
      Arbeitsverzeichnis** über den Neustart erhalten (wie `dockTransparencies`).
- [x] Ein Knopf setzt auf die Vorgabe zurück; er ist nur da anzufassen, wo es
      etwas zurückzusetzen gibt.
- [x] Beschädigte Einstellungen fallen weg — dann gilt die Vorgabe; in die
      CSS-Angabe gerät nichts als eine geprüfte Zahl.
- [x] Rechnung und Eintüten sind reine Logik mit Unit-Tests, Regler, Vorschau
      und die Leiste selbst mit Komponententests.

## Notes

- **Gedeutet als: der Schleier des Docks.** „frostyness“ ist das Milchglas
  hinter der Leiste — der `backdrop-filter`, der bis jetzt fest auf 14 px stand.
  Die Karte hängt über `ref:` an c0052 und folgt c0060, das die Durchsichtigkeit
  schon einstellbar gemacht hat; hier kommt die zweite Hälfte desselben Glases.
- **`src/core/transparency.ts`** trägt jetzt beide Werte: `cleanBlur` nimmt nur
  ganze Bildpunkte zwischen 0 und `MAX_DOCK_BLUR` (30) an, sonst null;
  `dockBlurCss` baut daraus `blur(Npx)` und fällt sonst auf `DEFAULT_DOCK_BLUR`
  (14, der bisherige Wert) zurück. Kein zweites Modul — die
  Einstellungs-Mechanik wäre Zeile für Zeile dieselbe gewesen.
- Gemerkt wird wie die Durchsichtigkeit: `dockBlurs` je Workspace-Pfad, im Store
  (`setDockBlur` / `resetDockBlur`, geprüft beim Merken), in `Settings` und im
  Hauptprozess beim Lesen **und** Schreiben eingetütet.
- Der Schleier geht als **CSS-Variable** `--dock-blur` ans Dock, nicht direkt als
  `backdrop-filter`; die Stilvorlage schreibt `backdrop-filter:
  var(--dock-blur, blur(14px))`. So bleibt der Rückfall dort stehen, wo er
  hingehört — und jsdom wirft die Angabe im Test nicht weg (unbekannte
  Eigenschaften fallen dort aus dem `style`-Attribut, Variablen nicht).
- Der Bereich „Darstellung“ heißt jetzt **„Das Glas des Docks“** und trägt beide
  Regler über einer gemeinsamen Vorschau, die Farbe und Schleier zugleich zeigt.
- Geprüft: `npx vitest run` (1086 Tests grün, 25 neue) und `npx vue-tsc
  --noEmit`. Ein Lauf in der echten Electron-App fand nicht statt
  (Ordnerauswahl ist ein nativer Dialog) — belegt ist alles über die
  Komponententests.

## Log

- 2026-08-09 status → in-progress (agent)
- 2026-08-09 core/transparency um `cleanBlur`/`dockBlurCss` erweitert (rot →
  grün), `dockBlurs` durch Store, Typen und Hauptprozess gezogen, zweiter Regler
  im Bereich „Darstellung“, Dock nimmt den Schleier über `--dock-blur`
- 2026-08-09 status → review (agent)
