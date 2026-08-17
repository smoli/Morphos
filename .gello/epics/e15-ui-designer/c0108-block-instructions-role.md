---
id: c0108
title: "Block instructions + type/role editing"
status: review
epic: e15
depends: [c0107]
created: 2026-08-16
commit: d08a622
updated: 2026-08-17
status-changed: 2026-08-17T18:56:08
usage-tokens: 58081
usage-cost: 7.488299
---

# Block instructions + type/role editing

## What

Let the user give a selected block its optional free-text `instructions` and a
`type`/role hint (e.g. header, sidebar, list, button), edited inline or in a
small popover. Both are persisted into `design.ui.json` and flow into the
`UI-LAYOUT` prompt section so the agent sees per-block guidance.

## Acceptance criteria

- [x] Selecting a block reveals editors for its `instructions` and `type`/role.
- [x] Edits persist to `design.ui.json` via `core/design`.
- [x] `instructions` and `type` appear in the `UI-LAYOUT` prompt section for
      that block.
- [x] Empty instructions/role are omitted cleanly (no empty noise in JSON or
      prompt).
- [x] A `.spec.ts` covers editing and persistence of both fields.

## Notes

Role hint can be a free-text field or a small preset list — the epic only
requires it be optional and steer the agent. Builds directly on the c0107 slice.

**Auswählen ist der neue Zustand.** Die Fläche wusste bisher, welcher Kasten
gerade seinen NAMEN bekommt (`editingId`); dazu kommt jetzt, welcher AUSGEWÄHLT
ist (`selectedId`). Beides entscheidet die Fläche und reicht es durch den ganzen
Baum, damit immer nur einer gemeint ist. Ein Klick auf einen Kasten wählt ihn
aus (im Kind bleibt der Klick stehen — er meint das Kind, nicht den Elter), ein
Klick daneben hebt die Auswahl auf.

**Benennen und Beschreiben bleiben getrennt.** Ein Klick auf den Namen benennt
um (c0107), ein Klick auf den Kasten öffnet sein Feld. Der Versuch, mit dem
Namen gleich auch auszuwählen, hat sich sofort an c0107 gestoßen („nach Escape
ist kein Feld offen") — und zu Recht: Zwei Dinge auf einen Klick sind eines zu
viel.

**Das Feld** ist eine eigene Komponente (`DesignInspector.vue`), unten rechts in
der Schicht — nicht am Kasten: Ein Kasten kann winzig sein oder am Rand kleben.
Es fängt jeden Zeiger ab (`@pointerdown.stop`), sonst zöge jeder Klick darin
einen Kasten auf. Rolle ist ein Vorschlagsfeld (`<datalist>`, `BLOCK_ROLES` in
`core/design`) und bleibt freier Text — die Liste dient nur der
Gleichförmigkeit: „Kopfzeile" zweimal gleich geschrieben liest der Agent auch
als dasselbe.

**Fertig ist ein Text mit dem Verlassen des Feldes** (`change`), nicht mit jedem
Tastendruck — sonst schriebe jeder Buchstabe die Datei neu. Hat sich nichts
geändert, geht auch nichts nach oben (kein Schreiben ohne Änderung). Escape
verwirft das Feld und schließt es, und bleibt dabei im Feld (`.stop`): ein Druck
räumt eine Sache ab. Was von der Platte zurückkommt, füllt die Felder erneut —
maßgeblich bleibt die Datei.

**Nichts gesagt ist der Normalfall.** Anders als beim Namen gibt es hier keinen
Platzhalter: Ein geleertes Feld nimmt die Angabe wieder weg. Das konnte das
Modell schon (`updateBlock` löscht bei leerem Text, `readBlock` schreibt nichts
Leeres), und `formatDesign` schweigt entsprechend — die Karte hat auf der Seite
nur noch belegt, dass der Weg durch die ganze Kette hält: In der Datei steht
danach kein `"instructions": ""`, im Prompt kein leeres `[]`.

Der Prompt selbst brauchte keinen Handschlag: c0106 nennt Rolle und Anweisungen
schon an jedem Kasten. Neu ist bloß, dass jemand sie eintragen kann.

## Review

### 2026-08-17T18:57:47 — pass

Checked: alle fünf Abnahmekriterien gegen den Code, der Diff von `d08a622`,
`npm test` und `npm run typecheck`. Lint gibt es in diesem Repo nicht (keine
eslint/prettier/biome-Konfiguration, `package.json` kennt nur `dev`, `build`,
`start`, `test`, `test:watch`, `typecheck`) — also nichts zu laufen, nicht
übersprungen.

- „Selecting a block reveals editors" belegt: `DesignBlock.vue:105`
  (`@click.stop="emit('select', …)"`) meldet den Klick, `DesignOverlay.vue`
  hält `selectedId` und zeigt `DesignInspector.vue` mit `input.di-type` und
  `textarea.di-instructions`. Der Klick bleibt im Kind stehen (Test „wählt den
  geschachtelten Kasten aus, nicht seinen Elter"), und Benennen bleibt getrennt
  (`.db-name` mit eigenem `@click.stop`, Test „hält Benennen und Auswählen
  auseinander").
- „Edits persist via core/design" belegt: `describe` → `AppWindow.vue:258` →
  `store.describeDesignBlock` (`stores/app.ts:218`) → `updateBlock` →
  `saveDesign`. `DesignFlow.spec.ts` prüft das an einer echten
  `design.ui.json` auf der Platte, nicht am Mock.
- „instructions und type im UI-LAYOUT" belegt: `formatDesign`
  (`core/prompt.ts:293`/`:298`) setzt `[type]` an den Namen und die
  Anweisungen darunter; `DesignFlow.spec.ts` prüft `- Kopfzeile [Kopfzeile]`
  und `Anweisungen: …` im fertigen Prompt.
- „Leeres wird sauber weggelassen" belegt: `updateBlock` (`core/design.ts:337`)
  löscht das Feld bei leerem Text; der Flow-Test liest die Datei roh und
  verlangt weder `instructions` noch `type` darin, der Prompt weder
  `Anweisungen:` noch `[]`. `app.spec.ts` prüft dasselbe am Geschriebenen
  (`'type' in written[1].blocks[0]` ist false).
- „`.spec.ts` deckt beides ab": `DesignInspector.spec.ts` (12 Fälle: Anzeigen,
  `change` statt Tastendruck, kein Schreiben ohne Änderung, Escape verwirft und
  behält den Druck bei sich, Rückmeldung von der Platte füllt das Feld),
  `DesignOverlay.spec.ts` (Auswahl, Abwahl, Zeichenzug ≠ Auswahl, Zug im Feld
  zeichnet nichts) und die zwei Ketten-Tests in `DesignFlow.spec.ts`.
- Prüfungen grün: `npm test` 96 Dateien / 1874 Tests, `npm run typecheck`
  (`vue-tsc --noEmit`) ohne Ausgabe. Kein `.skip`/`.only`/`todo`, kein
  `console.log`/`debugger` im Diff, kein abgeschwächter Test.
- Diff bleibt beim What: elf Dateien, alle am Entwurf. Der einzige Umbau
  außerhalb ist `findBlock` → `findBlockIn` in `core/design.ts` — nötig, weil
  die Fläche nur die Kästen bekommt und nicht den Entwurf, und mit eigenem
  Test.
- Nebenbei, nicht Teil des Commits: im Arbeitsverzeichnis liegt eine
  uncommittete Leerzeile in `src/components/TopBar.vue` (Zeile 105). Sie gehört
  nicht zu dieser Karte und ändert nichts — bitte beim nächsten Commit
  aufräumen.

## Log

- 2026-08-16 created from the e15 epic breakdown.
- 2026-08-16 status → ready (app)
- 2026-08-17 status → in-progress (agent)
- 2026-08-17 Auswahl (`selectedId`) in `DesignOverlay`/`DesignBlock`, neues Feld
  `DesignInspector.vue` (Rolle als Vorschlagsfeld, Anweisungen als Textfeld),
  `BLOCK_ROLES` + `findBlockIn` in `core/design`, `describeDesignBlock` im Store,
  `@describe` im `AppWindow`. Volle Suite 1874 Tests grün (29 neue),
  `vue-tsc` sauber, `npm run build` sauber.
- 2026-08-17 status → review (agent)
