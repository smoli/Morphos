---
id: c0113
title: Define multiple views
status: review
ref: c0105
epic: e15
commit: 38414bf
created: 2026-08-18
updated: 2026-08-18
status-changed: 2026-08-18T07:50:36
usage-tokens: 122423
usage-cost: 21.969337
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

## Review

### 2026-08-18T07:53:01 — pass

Geprüft: alle acht Akzeptanzkriterien am Code, der Diff von `38414bf`, sowie
`npm test`, `npm run typecheck` und `npm run build`.

- Kriterium 1 (`views` mit `id`/`title`/`description`/`blocks`): `View` und
  `Design.views` in `src/core/design.ts:78-92`; `readView` ergänzt Fehlendes,
  kappt bei `MAX_VIEWS` und hält die Kasten-Ids über ALLE Ansichten auseinander
  (`normalizeDesign`, `src/core/design.ts:314-371`).
- Kriterium 2 (alte Datei bleibt lesbar): `normalizeDesign` macht aus `blocks`
  am Stamm die eine Ansicht „Ansicht 1“ (`src/core/design.ts:352-356`), belegt
  in `design.spec.ts:245` und — bis auf die Platte — in
  `designstore.spec.ts:122`.
- Kriterium 3 (Reiterleiste): `DesignViewBar.vue` zeigt jede Ansicht, hebt die
  gezeigte hervor und bietet ＋ nur unterhalb `MAX_VIEWS`; `onAddView`
  (`DesignOverlay.vue`) öffnet zugleich das Feld — `DesignOverlay.spec.ts:775`
  und, durch das ganze Fenster hindurch, `AppWindow.spec.ts:312` (der neue
  Reiter steht vorn, `input.dvi-title` zeigt „Ansicht 2“).
- Kriterium 4 (Feld der Ansicht): `DesignViewInspector.vue` gibt Titel und
  Beschreibung und löscht samt Kästen; ein geleerter Titel wird zweifach
  abgefangen — im Feld (`commitTitle`) und im Modell (`updateView`,
  `src/core/design.ts:435-438`). Belegt in `DesignViewInspector.spec.ts:47` und
  `app.spec.ts:1545` (dort wird auch nichts geschrieben).
- Kriterium 5 (Züge gelten der gezeigten Ansicht): jeder Kasten-Zug im Store
  läuft durch `changeDesignView` → `inView` (`src/stores/app.ts`); ein Zug auf
  einen Kasten der anderen Ansicht schreibt gar nichts
  (`app.spec.ts:1496`), Zeichnen/Benennen/Beschreiben/Schieben/Schachteln/
  Löschen sind in `app.spec.ts:1465` und `:1479` abgedeckt.
- Kriterium 6 (erster Kasten legt die Ansicht an): `addDesignBlock` legt bei
  fehlender Ansicht `emptyView(viewTitleFor(0))` an und zeigt sie danach
  (`app.spec.ts:1506`); `emptyDesign()` hat weiterhin keine Ansicht.
- Kriterium 7 (Prompt): `formatDesign` schreibt je Ansicht `ANSICHT: <Titel>`,
  Beschreibung und Baum, für eine beschriebene leere Ansicht den ausdrücklichen
  Freibrief; Kopf und `SYSTEM_PROMPT` sagen „baue sie alle und mach sie
  erreichbar“ (`prompt.spec.ts:292`, `:319`, `:333`). Die Schranke ist
  konsistent auf `hasContent` umgestellt (`prompt.ts`, `generate.ts`,
  `stores/app.ts`).
- Kriterium 8 (Tests): Modell `design.spec.ts:264-401`, Datei
  `designstore.spec.ts:66/122`, Prompt `prompt.spec.ts:292-337`, Store
  `app.spec.ts:1411-1560`, beide Bauteile in eigenen Spec-Dateien, und die
  ganze Scheibe in `DesignFlow.spec.ts:359` (zwei Ansichten von der Fläche über
  `design.ui.json` bis in den Prompt, samt Wiederfinden im zweiten Fenster und
  Löschen).
- Checks: `npm test` 2086 Tests in 98 Dateien grün (Exit 0), `npm run
  typecheck` (vue-tsc) sauber, `npm run build` sauber. Ein Lint-Skript gibt es
  im Projekt nicht — es konnte darum keines laufen. Kein Test ist übersprungen,
  `.only`t oder abgeschwächt; das einzige `it.skipIf` in `gitstore.spec.ts:463`
  ist älter als diese Karte.
- Der Diff bleibt beim What: `generate.spec.ts` und `DesktopView.spec.ts`
  ändern nur Vorgaben von `blocks` auf `views`, kein toter Debug-Code, keine
  Reihenfolge-, Kopier- oder Verschiebe-Funktionen (unter „Nicht dabei“
  ausdrücklich ausgenommen).

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
