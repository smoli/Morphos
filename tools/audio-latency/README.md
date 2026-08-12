# Tastendruck → Ton messen

Werkzeug zur Karte **c0081**: Wie lange dauert es von der Taste bis zum Ton,
und woran hängt die Zeit? Gemessen wird hier, gedeutet in
[`src/core/audiolatency.ts`](../../src/core/audiolatency.ts) — geprüft von
`src/core/audiolatency.spec.ts`.

## Das Modell

```
Taste ──input──▶ JS-Handler ──dispatch──▶ start() ──render──▶ Puffer ──device──▶ Lautsprecher
```

| Abschnitt  | Woher die Zahl kommt              | Wer ihn in der Hand hat        |
| ---------- | --------------------------------- | ------------------------------ |
| `input`    | `event.timeStamp` → Handler       | Betriebssystem + Renderer      |
| `dispatch` | Handler → `start()` ist zurück    | die App (Dekodieren je Treffer)|
| `render`   | `AudioContext.baseLatency`        | `latencyHint`, Chromium        |
| `device`   | `AudioContext.outputLatency`      | Audiotreiber (WASAPI/CoreAudio)|

`render` + `device` sind der **Plattformboden** — darunter kommt kein Code.

## Messen

**Von Hand** (misst auch `input`, also den echten Tastenweg):
`index.html` doppelklicken — Edge, Chrome und Electron gehen alle. Auf
„Messung starten“ drücken und dann eine beliebige Taste immer wieder drücken,
bis alle vier Arme durch sind (Vorgabe: 15 Treffer je Arm, `?hits=30` ändert
das). Zum Schluss das JSON unten kopieren.

**Im Selbstlauf**, in genau der Hülle, in der Morphos steckt:

```bash
npx electron tools/audio-latency/measure.mjs --hits=15 > messung.json
```

Der Selbstlauf erzeugt die Tastendrücke selbst — alles ab dem JS-Ereignis
stimmt, der Weg des Betriebssystems davor (`input`) fehlt darin.

Chromiums Puffergröße lässt sich dabei erzwingen (gilt für den ganzen Prozess
und übersteuert den `latencyHint` der Seite):

```bash
npx electron tools/audio-latency/measure.mjs --audio-buffer-size=128 > messung.json
```

**Schleifenmessung** (Knopf in `index.html`): spielt Klicks und hört sie über
das Mikrofon wieder ein. Das ist der einzige wirklich hörbare Beleg, misst aber
den vollen Umlauf (Ausgabe + Luft + Eingabe). Sauber ist daran die **Differenz**
zweier Einstellungen auf derselben Maschine — die ist reine Ausgabeseite.

## Auswerten

```bash
npx vite-node -c vitest.config.ts tools/audio-latency/report.ts messung.json
```

Das gibt die Markdown-Tabelle für die Karte aus, dazu Puffergrößen, den Spruch
je Arm (`ok` / `app-code` / `web-tuning` / `native-audio`), den Abstand zum
ersten Arm und zum Schluss den Spruch über den **ganzen Lauf**. Der letzte ist
der wichtigere: Erst der Blick quer über die Arme zeigt, ob der `latencyHint`
auf dieser Plattform überhaupt etwas bewegt — unter Windows tut er es nicht.

Gemessene Läufe liegen in [`measurements/`](measurements):

| Lauf | bester Arm | Boden |
| --- | ---: | --- |
| `windows-chrome151-manual.json` | **50,7 ms** | 480 Bilder, in jedem Arm gleich |
| `macos-electron33-auto.json` | 7,8 ms | 480 / 256 / 128 Bilder je nach Hint |
| `macos-electron33-buffer128.json` | 7,8 ms | 128 Bilder erzwungen |
