---
id: i0002
title: Cannot enter prompt after separating and rejoining chat
status: review
type: issue
created: 2026-08-07
updated: 2026-08-08
status-changed: 2026-08-08T07:17:00
epic: e0004
---

After I separated and rejoined the chat I cannot send the prompt. The send button never get’s active

## Notes

**Ursache.** Der ausgelagerte Chat wird per `<Teleport>` in das Kindfenster
gehängt — dieselben DOM-Knoten wandern hin und beim Zudocken zurück. Chromium
macht Knoten, die in einem *geschlossenen* Fenster lagen, dabei unbrauchbar:
zurückgeschoben hängen sie zwar wieder im Dokument (`isConnected`,
`ownerDocument` stimmen), ihre Ereignis-Handler feuern aber nie mehr. Damit sind
`v-model` und der Enter-Handler des Eingabefelds tot — der Anwender tippt, `text`
bleibt leer, der Senden-Knopf bleibt ausgegraut.

In einer Electron-Sonde nachgemessen: die Adoption in das Kindfenster allein ist
harmlos (Handler feuern weiter), erst das Schließen des Fensters tötet sie
(`survivedAdoption: true`, `survivedRoundTrip: false`). Deshalb trat der Fehler
über den Weg „Fenster schließen“ auf, über „Zurückholen“ dagegen meist nicht:
dort wird noch vor dem Abbau des Dokuments verschoben — reine Timing-Glückssache.

**Behebung.** `<Teleport>` bekommt einen `:key`, der mit dem Ort wechselt
(`docked`/`windowed`). Vue baut die Oberfläche bei jedem Wechsel frisch auf,
statt dieselben Knoten hin- und herzuschieben; die frischen Knoten entstehen im
lebenden Dokument und haben lebende Handler. Der Zustand (Eingabetext, Anhänge,
Verlauf) lebt im `setup` der Komponente und übersteht den Neuaufbau.

**Nachweis.** Eine Electron-Sonde mit der echten Komponente und echten
Tastenanschlägen zeigte vor der Behebung `sendDisabled: true` nach dem Schließen
des Fensters, danach `false` auf beiden Wegen. Die Sonde selbst ist nicht
eingecheckt (sie bräuchte Electron im Testlauf); die Invariante sichern vier
jsdom-Tests in `ChatDock.spec.ts` ab — vor allem, dass das Eingabefeld nach dem
Wechsel ein *neuer* Knoten ist.

## Abnahme

- [x] Nach Auslagern und Zurückholen (Fenster schließen) nimmt die Eingabe wieder Text an, der Senden-Knopf wird aktiv.
- [x] Dasselbe über den Knopf „Zurückholen“.
- [x] Halb getippter Text und Anhänge überleben den Fensterwechsel in beide Richtungen.
- [x] Gesamter Testlauf grün (422 Tests), `vue-tsc` sauber.

## Log

- 2026-08-07 status → discuss (app)
- 2026-08-08 status → ready (app)
- 2026-08-08 status → in-progress (agent)
- 2026-08-08 status → review (agent)
