---
id: c0110
title: "Nesting + reparent + delete"
status: done
epic: e15
depends: [c0108, c0109]
created: 2026-08-16
commit: f2dd7fb
updated: 2026-08-27
status-changed: 2026-08-27T22:33:45
usage-tokens: 88882
usage-cost: 11.200422
---

# Nesting + reparent + delete

## What

Complete the block manipulation. Dragging a block into another nests it as a
child; dragging it out reparents it (up to the root); deleting a block removes
it (and offers a sensible rule for its children). The block tree in
`design.ui.json` reflects the nesting, and the `UI-LAYOUT` prompt section
renders the hierarchy with indentation.

## Acceptance criteria

- [x] Dropping a block inside another makes it a child (using `core/design`
      reparent helpers); child geometry stays sane relative to the parent.
- [x] Dragging a block out reparents it toward the root.
- [x] Deleting a block removes it; its children are either removed or promoted
      by a defined, tested rule.
- [x] The JSON tree and the `UI-LAYOUT` prompt section show the resulting
      nesting/indentation.
- [x] No cycles are ever created (a block cannot become its own descendant).
- [x] A `.spec.ts` covers nest, reparent, delete, and the no-cycle guard.

## Notes

Final card of the epic; depends on both editing cards (c0108, c0109). Reuses the
tree helpers from c0104.

**Die Lage entscheidet, nicht ein eigener Zug.** Es gibt kein „Verschachteln“ und
kein „Umhängen“ als zwei Handgriffe, sondern EINE Regel: Der Elter eines Kastens
ist der unterste Kasten, der ihn ganz umschließt (`containerIn`) — umschließt ihn
keiner, gehört er an die Wurzel. Damit sind die ersten zwei Kriterien dieselbe
Sache von zwei Seiten: Hineingeschoben verschachtelt, hinausgeschoben hängt um,
und zwar bis zur Wurzel. Der Baum kann so nie etwas anderes sagen als das Bild,
und es gibt keinen Zustand, in dem ein Kind sichtbar neben seinem Elter liegt.

**Ganz drinnen heißt drinnen.** Nicht der Mittelpunkt entscheidet (wie in
manchen Zeichenprogrammen), sondern die ganze Fläche. Das ist strenger, aber es
ist die Bedingung dafür, dass „Kindgeometrie bleibt vernünftig“ von selbst gilt
statt hinterher zurechtgerückt zu werden: Ein Kind liegt IMMER in seinem Elter,
weil es sonst keines wäre. Die Kante zählt als drinnen (sonst ließe sich in einen
Kasten kein gleich großer zeichnen), mit einem Millionstel Nachsicht gegen den
Rechenstaub des Fließkommas — 0.2 + 0.4 ist als `double` größer als 0.6.

**Umgehängt wird nur, wer angefasst wurde.** Schieben und Ziehen gehen durch
`nestBlock`, also hängt sich der eine Kasten um, der gerade bewegt wurde (beim
Ziehen an einer Kante auch er: Wer seinen Kasten aus dem Elter herauszieht, meint
das). Wer dagegen einen ELTER kleiner zieht, verliert seine Kinder nicht — sie
sind nicht angefasst, und ein Kasten, der ein paar Prozent schrumpft, soll nicht
seinen halben Baum in die Wurzel entlassen. Ein Kind darf darum weiter über
seinen Elter hinausragen (die alte Freiheit aus c0104) — nur nicht, weil es
selbst dorthin gezogen wurde.

**Gelöscht wird der Rahmen, nicht der Inhalt.** `deleteBlock` nimmt den Kasten
weg und hebt seine Kinder an seine Stelle unter seinem Elter (mit ihrer
Reihenfolge). Das ist die getestete Regel, und sie ist die verzeihliche: Weil die
Anteile absolut sind, bleibt beim Löschen alles liegen, wo es liegt — nur die
Gliederung wird flacher. Ein Fehlgriff kostet einen Kasten, nicht einen halben
Entwurf; darum wird auch nicht nachgefragt. Wer einen ganzen Zweig los sein will,
löscht ihn von innen nach außen.

**Kein Kreis, und keine Tiefe, die beim Speichern verschwindet.** Gegen den Kreis
wirken zwei Dinge unabhängig: `containerIn` überspringt den bewegten Kasten samt
seinem ganzen Zweig (ein Nachfahre wird also nie als Elter angeboten), und
`reparentBlock` verweigert einen solchen Zug ohnehin (c0104). Dazu kommt eine
zweite, weniger offensichtliche Falle: `normalizeDesign` kappt bei
`MAX_DESIGN_DEPTH`, und geschrieben wird stets zurechtgerückt — zu tief
geschachtelt wäre ein Kasten beim nächsten Speichern still verloren. `canNestUnder`
prüft das vorher; im Zweifel bleibt der Kasten, wo er ist (bzw. hängt ein
gezeichneter an der Wurzel).

**Der künftige Elter leuchtet auf, solange der Zug läuft.** Eine Schachtelung,
die man erst nach dem Loslassen sieht, ist geraten. Die Fläche zeigt sie darum
vorher — mit derselben Funktion, die sie hinterher ausführt (`containerIn`, wie
schon `moveRect`/`resizeRect` in c0109): Zwei Rechnungen für dasselbe wären zwei
Wahrheiten. Die Auszeichnung ist bewusst nicht die Farbe der Auswahl, denn sie
sagt etwas anderes — „hier hinein“, nicht „dieser hier“.

**„Gemeint ist das Unterste“ gilt jetzt wirklich.** Die Anmerkung aus dem Review
zu c0109 ist damit erledigt: Ein Druck auf ein NICHT ausgewähltes Kind schob
bisher dessen ausgewählten Elter. Jetzt melden alle Kästen den Druck, der erste
(innerste) gewinnt, und angefasst ist nur der ausgewählte — ein Druck auf ein
Kind zeichnet also. Das ist für diese Karte keine Kür: Sonst wäre die Fläche
jedes Kindes für den Stift verloren, sobald sein Elter ausgewählt ist, und in ein
Kind hinein ließe sich nichts mehr schachteln. Der Preis: Einen Elter, den seine
Kinder ganz ausfüllen, schiebt man an seinen Griffen statt am Rumpf.

**Gelöscht wird im Feld, nicht mit der Entf-Taste.** Das Feld redet von genau
einem Kasten (c0108) — also gehört das Wegwerfen dieses Kastens dorthin. Ein
Tastenkürzel wäre naheliegend, aber die Auswahl lebt in der Zeichenfläche,
während die Tasten dieser Schale in `DesktopView` liegen und stets dem AKTIVEN
Fenster gelten; ein eigener Lauscher in der Schicht würde in jedem offenen
Entwurfs-Modus zugleich löschen. Wer das Kürzel will, verschiebt zuvor die
Auswahl in den Store — eine eigene Karte, nicht diese.

Nicht angefasst: der Prompt. Der `UI-LAYOUT`-Abschnitt rückt Kinder seit c0106
unter ihrem Elter ein — es gab bloß bis jetzt keine Kinder zu zeigen; die dünne
Scheibe (`DesignFlow.spec.ts`) prüft das nun über eine echte Datei mit.

## Review

### 2026-08-17T19:36:49 — pass

Checked: alle sechs Akzeptanzkriterien gegen den Code, der Diff von `f2dd7fb`,
`npm test`, `npx vue-tsc --noEmit`, `npm run build` (ein Lint-Skript gibt es
nicht).

- Volle Suite grün: 1967 Tests in 96 Dateien, `vue-tsc` und `npm run build`
  beide Exit 0. Kein `.only`, `.skip`, `console.log` oder abgeschwächter Test
  in den berührten Dateien; der Arbeitsbaum ist bis auf `.companion/state.json`
  sauber.
- „Hineingeschoben verschachtelt" und „hinausgeschoben hängt um" sind belegt:
  `nestBlock` (design.ts:610) geht über `containerFor` + `reparentBlock`, also
  über die Helfer aus c0104; `design.spec.ts` prüft beide Richtungen, das
  Mitwandern der Kinder und die unveränderte Geometrie, `app.spec.ts` dasselbe
  durch `addDesignBlock`/`moveDesignBlock`/`resizeDesignBlock` bis in die
  geschriebene Datei.
- „Kindgeometrie bleibt vernünftig" gilt hier konstruktiv statt korrigierend:
  `fits` verlangt die GANZE Fläche im Elter (design.ts:492), ein Kind liegt
  also immer in seinem Elter. Die `FIT`-Nachsicht von 1e-6 ist getestet
  (`0.2 + 0.4 > 0.1 + 0.5` als `double`) und liegt weit unter einem Pixel.
- Löschen: `deleteBlock` (design.ts:631) hebt die Kinder an die Stelle des
  gelöschten Kastens — die Regel ist definiert UND getestet (Wurzel- wie
  Kindfall, Geometrie, unbekannte Id, Unversehrtheit des übergebenen
  Entwurfs). Der Weg Feld → Schicht → Fenster → Store ist in
  `DesignInspector.spec.ts`, `DesignOverlay.spec.ts` und `AppWindow.spec.ts`
  je eigen abgedeckt.
- Baum und Prompt: `DesignFlow.spec.ts:228` prüft über eine echte Datei den
  Baum in `design.ui.json` und die Einrückung im `UI-LAYOUT` (`- Inhalt` /
  `  - Liste`) — auch nach dem Umhängen und nach dem Löschen des Elters.
- Kein Kreis, zweifach abgesichert: `containerIn` überspringt den bewegten
  Kasten samt Zweig (`continue` vor der Rekursion, design.ts:512), und
  `reparentBlock` verweigert einen Nachfahren als Elter (design.ts:471). Beides
  getestet, dazu die Vorschau (`bietet den eigenen Zweig nicht als Elter an`).
- `canNestUnder` ist an `normalizeDesign` richtig geeicht: `readBlock` liest
  Kinder nur bei `depth + 1 < MAX_DESIGN_DEPTH`, die Rechnung
  `depth + 1 + height < MAX_DESIGN_DEPTH` trifft genau diese Grenze, und der
  Test `lässt eine ganze Kette bis MAX_DESIGN_DEPTH unangetastet durch` belegt
  sie am Zurechtrücken selbst.
- Der Diff bleibt im What: `core/design`, Store, die drei Entwurfs-Komponenten
  und eine `@delete`-Zeile im `AppWindow` — nichts darüber hinaus. Die
  Anmerkung aus dem Review zu c0109 (Druck auf ein nicht ausgewähltes Kind
  schob dessen Elter) ist mit erledigt und ist hier keine Zutat: Ohne sie ließe
  sich in ein Kind nichts hineinzeichnen.

Zwei Anmerkungen ohne Einfluss auf das Urteil, für den nächsten Zug: Die
Vorschau (`dropId`) fragt `containerIn`, aber nicht `canNestUnder` — an der
16. Ebene leuchtet ein Elter auf, unter den `nestBlock` hinterher doch nicht
hängt. Und `deleteBlock` reicht die Kinderliste des gelöschten Kastens
unkopiert nach oben (Strukturteilung mit dem alten Entwurf); solange niemand
einen Entwurf verändert, ist das harmlos, weicht aber vom `.map`-Kopieren der
übrigen Helfer ab.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 status → in-progress (agent)
- 2026-08-17 `containerIn`/`containerFor`, `parentOf`, `canNestUnder`, `nestBlock`
  und `deleteBlock` in `core/design`; `deleteDesignBlock` im Store, Verschachteln
  in `addDesignBlock`/`moveDesignBlock`/`resizeDesignBlock`; „Kasten löschen“ im
  `DesignInspector`, der künftige Elter (`dropId`) in `DesignOverlay`/
  `DesignBlock`, `@delete` im `AppWindow`. Dazu die Anmerkung aus dem Review zu
  c0109 erledigt: Ein Druck auf ein nicht ausgewähltes Kind zeichnet, statt
  seinen Elter zu schieben. Volle Suite 1967 Tests grün (51 neue), `vue-tsc`
  sauber, `npm run build` sauber.
- 2026-08-17 status → review (agent)
- 2026-08-27 status → done (app)
