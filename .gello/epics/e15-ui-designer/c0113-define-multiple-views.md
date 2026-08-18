---
id: c0113
title: Define multiple views
status: review
ref: c0105
epic: e15
commit: 312a242
created: 2026-08-18
updated: 2026-08-18
status-changed: 2026-08-18T07:50:36
---

I want to be able to define multiple views. Each view has their own title and description and can hold an arbitrary number of blocks

## What

Eine App hat selten nur einen Bildschirm — Liste und Detail, Anmeldung und
Arbeitsfläche, Einstellungen. Der Entwurf kannte bisher nur einen: einen Baum
aus Kästen, und damit war alles gesagt. Also bekommt ein Entwurf ANSICHTEN: jede
mit ihrem Titel, ihrer freiwilligen Beschreibung und ihrem eigenen Baum. Die
Schicht zeigt eine davon, gewechselt wird in einer Reiterleiste, und der Prompt
nennt jede Ansicht als eigenen Abschnitt — samt der Ansage, dass der Agent alle
bauen und erreichbar machen soll.

## Acceptance criteria

- [x] Ein Entwurf hält beliebig viele Ansichten (`design.ui.json`: `views`), jede
      mit `id`, `title`, optionaler `description` und ihren eigenen `blocks`.
- [x] Eine Datei aus der Zeit davor (Kästen unmittelbar am Entwurf) bleibt
      lesbar — sie wird zu der einen Ansicht, die sie war.
- [x] Im Entwurfs-Modus zeigt eine Reiterleiste alle Ansichten; ein Klick
      wechselt, ＋ legt eine weitere an und öffnet sogleich ihr Feld.
- [x] Das Feld der gezeigten Ansicht gibt ihr Titel und Beschreibung und wirft
      sie auf Wunsch weg (samt ihren Kästen); ein leerer Titel bleibt unbeachtet.
- [x] Zeichnen, Benennen, Beschreiben, Schieben, Schachteln und Löschen gelten
      der GEZEIGTEN Ansicht; die anderen bleiben unberührt.
- [x] Gibt es noch keine Ansicht, legt der erste gezeichnete Kasten sie an — wer
      zeichnen will, muss nichts vorbereiten.
- [x] Der Prompt (`UI-LAYOUT`) nennt jede Ansicht mit Titel, Beschreibung und
      ihrem Baum und sagt, dass alle zu bauen und erreichbar zu machen sind.
- [x] `.spec.ts` decken das Modell, die Datei, den Prompt, den Store, die beiden
      neuen Bauteile und die ganze Scheibe (`DesignFlow.spec.ts`) ab.

## Notes

**Eine Ansicht ist ein Bildschirm, kein Ausschnitt.** Die Anteile jeder Ansicht
meinen weiter dasselbe App-Fenster (c0104) — zu sehen ist stets genau eine.
Damit bleibt alles, was für einen Baum galt, wörtlich gültig; hinzu kommt nur die
Frage, VON WELCHEM Bildschirm die Rede ist.

**Zwei Ebenen, zwei Zuständigkeiten.** Die Baum-Helfer (`addBlock`, `nestBlock`,
`deleteBlock` …) arbeiten seit dieser Karte an einer `View`, nicht am `Design`;
`inView(design, viewId, fn)` setzt eine solche Änderung in den Entwurf zurück.
Das ist die ganze Umstellung: Was mit Kästen zu tun hat, kennt nur seine Ansicht,
was mit Ansichten zu tun hat (`addView`, `removeView`, `updateView`), rührt keine
Kästen an. Im Store läuft jeder Kasten-Zug darum durch ein `changeDesignView` —
eine Stelle, an der „die gezeigte Ansicht“ steht, statt sechs.

**Alte Dateien bleiben lesbar.** `normalizeDesign` nimmt einen Entwurf mit
`blocks` am Stamm und macht daraus eine Ansicht („Ansicht 1“). Es gibt keine
Wanderung und keinen Schalter: Gelesen wird beides, geschrieben nur noch die neue
Form — beim nächsten Speichern steht die Datei von selbst richtig da. Die Ids der
Kästen sind dabei im GANZEN Entwurf eindeutig (nicht je Ansicht): Sonst fände ein
Zug in der einen den Kasten der anderen.

**Leer heißt: keine Ansicht.** `emptyDesign()` hat keine — und der erste Kasten
legt die erste an (`addDesignBlock`). Eine Ansicht im Voraus zu verlangen, wäre
eine Hürde vor dem ersten Strich; und die Datei soll nicht von etwas erzählen,
das niemand angelegt hat. Aus demselben Grund darf auch die letzte Ansicht weg:
Dann ist der Entwurf wieder leer, wie er anfing.

**Was der Entwurf SAGT, entscheidet `hasContent`.** An ihm hängt, ob überhaupt
eine `design.ui.json` entsteht (c0112) und ob ein `UI-LAYOUT` im Prompt steht
(c0106). Er zählt eine Ansicht, sobald sie einen Kasten hat ODER beschrieben ist
— eine beschriebene Ansicht ohne Kästen ist eine Ansage („Einstellungen: Sprache
und Farben“), eine frisch angelegte „Ansicht 2“ ohne alles ist ein Platzhalter.
Der Prompt sagt bei einer beschriebenen, leeren Ansicht ausdrücklich, dass der
Agent sie frei gestalten soll.

**Ein Titel ist Pflicht, eine Beschreibung nicht.** Der Titel ist die Überschrift
des Abschnitts im Prompt; eine Überschrift ohne Wort wäre keine. `updateView`
nimmt einen leeren Titel darum nicht an (der alte bleibt), während eine geleerte
Beschreibung das Feld wieder wegnimmt — wie Rolle und Anweisungen beim Kasten
(c0108). Und `updateView` gibt denselben Entwurf zurück, wenn sich nichts ändert:
Ein Feld, das man ohne Änderung verlässt, schreibt die Datei nicht neu.

**Wo man steht, gehört dem Fenster.** `designViewId` ist Fensterzustand und kein
Teil der Datei: Zwei Fenster derselben App dürfen an verschiedenen Ansichten
arbeiten. Nach jedem neuen Stand rückt `keepDesignView` sie zurecht — die
bisherige bleibt, solange es sie gibt, sonst ist es die erste. Sonst zeigte die
Schicht die Kästen einer Ansicht, die es nicht mehr gibt.

**Die Reiterleiste ist ein Angebot, kein Werkzeug.** `DesignViewBar` zeigt und
bittet (`select`, `add`, `edit`); geschrieben wird wie bei allem anderen im
Store, maßgeblich bleibt die Datei. Ein Klick auf den schon vorn stehenden
Reiter kann nur eines meinen — beschreiben —, also öffnet er das Feld. Das Feld
(`DesignViewInspector`) sitzt links unten, gegenüber dem Feld des ausgewählten
Kastens: Ansicht und Kasten sind zwei Ebenen, und man beschreibt gern beide
nacheinander. Ohne Ansicht bleibt die Leiste ganz still.

**Nicht dabei** (mögliche Folgekarten): die Reihenfolge der Ansichten ändern,
eine Ansicht kopieren, Kästen zwischen Ansichten verschieben. Für alle drei ist
das Modell da (`reparentBlock`, `addView`) — die Karte verlangt sie nicht.

## Log

- 2026-08-18 status → in-progress (agent)
- 2026-08-18 Ansichten im Modell (`View`, `views`, `inView`, `addView`,
  `removeView`, `updateView`, `hasContent`, Migration alter Dateien), Baum-Helfer
  auf `View` umgestellt; Ansichts-Zustand und -Aktionen in `stores/app`;
  `DesignViewBar` + `DesignViewInspector`, im `DesignOverlay` und `AppWindow`
  verdrahtet; `UI-LAYOUT` je Ansicht in `core/prompt`. Volle Suite 2086 Tests
  grün (78 neue), `vue-tsc` sauber, `npm run build` sauber (kein node:fs im
  Renderer-Bündel).
- 2026-08-18 status → review (agent)
