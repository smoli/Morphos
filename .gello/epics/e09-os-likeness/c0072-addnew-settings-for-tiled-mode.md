---
id: c0072
title: Add new settings for tiled mode
status: in-progress
created: 2026-08-10
updated: 2026-08-10
status-changed: 2026-08-10T06:51:16
epic: e09
---

# Add new settings for tiled mode

Hide app window chrome (appears when mouse is near window top)
Size of the window gap

## Acceptance criteria

- [x] Im Einstellungsfenster, Bereich **„Darstellung“**, steht zwischen dem
      Desktop- und dem Dock-Block ein Block **„Die Kacheln“** mit beiden
      Einstellungen und einer Vorschau, die zeigt, was sie tun.
- [x] Ein Regler stellt die **Fuge** zwischen zwei Kacheln von 0 (lückenlos) bis
      `MAX_TILE_GAP` Bildpunkten ein; ein Knopf setzt sie auf die Vorgabe (12 px)
      zurück und ist gesperrt, solange es nichts zurückzusetzen gibt.
- [x] Die gewählte Fuge gilt **sofort**: Kacheln, Rand der Kachelfläche und die
      Griffe an den Fugen rücken nach — gerechnet wird überall mit demselben
      Wert (`desktop.tileGap`), nicht mehr mit einer Konstanten.
- [x] Ein Schalter legt die **Titelleiste** einer Kachel weg; sie kommt hervor,
      sobald der Zeiger den oberen Rand der Kachel erreicht, und geht wieder,
      wenn er sie verlässt. Ein laufender Zug (Tragen) hält sie da.
- [x] Weggelegt heißt nicht abgebaut: Die Fensterknöpfe bleiben erreichbar, und
      der Fensterkörper bekommt die ganze Kachel.
- [x] Außerhalb des Kachel-Modus ändert sich nichts — im Fenster-Modus ist die
      Leiste der Griff, im Einzel-Modus trägt sie den Weg zurück zum Desktop.
- [x] Beides wird **je Arbeitsverzeichnis** gemerkt und übersteht den Neustart;
      beschädigte Werte fallen beim Lesen weg (dann gilt die Vorgabe).
- [x] Tests: core/tilesettings (Bereich, Prüfung, Eintüten), Workspace-Store
      (laden, merken, zurücksetzen, ohne Ordner nichts anfassen), Desktop-Store
      (Kacheln rücken mit der Fuge nach, Fuge 0 legt sie lückenlos aneinander),
      WindowFrame (weglegen/hervorholen/halten), Einstellungs-Bereich.

## Notes

- `core/tilesettings` (neu) trägt beide Werte samt Prüfung — wie `core/dock` und
  `core/transparency` es für die Leiste tun. `DEFAULT_GAP` ist aus `core/tiling`
  **fort**: Die Rechnung kannte eine Vorgabe, die keine mehr ist; die Fuge kommt
  jetzt bei jedem Aufruf als `gap` herein. `MAX_TILE_GAP` (40) bleibt unter
  `MIN_TILE` (96) — sonst zehrte die Fuge beim Ziehen die Kachel daneben auf.
- Im Desktop-Store ist aus der Konstanten `TILE_GAP` der Getter `tileGap`
  geworden. Er steht in `tileRects`, `dragGap`, `aimTileSwap` und `syncTiles`;
  `DesktopView` rückt die Kachelfläche damit ein, `TileGaps` sucht damit seine
  Griffe. Weil die Rechtecke aus dem Baum abfallen, rücken die Kacheln beim
  Schieben des Reglers von selbst nach — es gibt keinen zweiten Weg.
- Die weggelegte Leiste verlässt im `WindowFrame` den Fluss (`position:
  absolute`) und legt sich über den Fensterkörper; der bekommt so die ganze
  Kachel. Hervorgeholt wird sie über einen **Fühler**: einen 8 px schmalen
  Streifen am oberen Rand, der über dem iframe der App liegt — sonst schluckte
  das den Zeiger, bevor er oben ankommt. Fort ist sie erst wieder, wenn der
  Zeiger die Leiste verlässt **und** kein Zug läuft (beim Tragen verlässt er sie
  sofort, sie soll dabei nicht unter der Hand verschwinden).
- Der Einstellungs-Block zeigt zwei Kacheln in einer Fläche mit genau der
  gewählten Fuge — ringsum wie dazwischen, so wie der Desktop sie stellt. Ihre
  angedeutete Leiste verschwindet, sobald der Schalter sie weglegt.

## Log

- 2026-08-10 status → ready (app)
- 2026-08-10 status → in-progress (agent)
- 2026-08-10 Fuge und weggelegte Titelleiste umgesetzt: core/tilesettings (neu),
  `tileGap` statt Konstante im Desktop-Store, Fühler am oberen Rand im
  WindowFrame, Block „Die Kacheln“ in den Einstellungen, README nachgezogen
  (1360 Tests grün, typecheck + build sauber)
