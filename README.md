# Morphos

**Eine Electron-App, die sich selbst weiterentwickelt.**

Zu Beginn zeigt Morphos nur ein Eingabefeld. Der Anwender schreibt hinein, *was
die Anwendung sein soll* — ein Taschenrechner, ein Editor, eine
Tabellenkalkulation, ein Spiel. Ein LLM entwickelt daraufhin die Oberfläche und
die Funktionen **live** und bietet sie sofort an. Während der Verwendung lassen
sich jederzeit neue Ideen umsetzen: Jede Eingabe verändert und erweitert die
laufende App.

## Wie es funktioniert

```
┌────────────────────────────┐        ┌──────────────────────┐
│  Morphos (Electron)        │        │  Claude CLI          │
│                            │ prompt │  (claude -p)         │
│  Eingabefeld ───────────────────────▶  erzeugt/ändert die  │
│                            │        │  App als HTML-Dok.   │
│  Sandbox-iframe ◀───────────────────  vollständiges HTML   │
│  (zeigt die erzeugte App)  │  html  │                      │
└────────────────────────────┘        └──────────────────────┘
```

- **LLM-Anbindung:** Die App ruft die **Claude CLI** als Subprozess auf
  (`claude -p --output-format json`). Es wird **kein API-Key** in der App
  verwaltet — es zählt deine bestehende Claude-Anmeldung.
- **Rendering:** Das LLM liefert ein **komplettes, in sich geschlossenes
  HTML-Dokument** (HTML + CSS + JS inline). Es läuft isoliert in einem
  **Sandbox-iframe** (`allow-scripts`, ohne `same-origin`) — der generierte Code
  kann die Host-App nicht erreichen.
- **Weiterentwicklung:** Bei jeder neuen Eingabe wird das aktuelle Dokument
  mitgeschickt; das LLM entwickelt es weiter, statt bei Null zu beginnen.
- **Versionen:** Jede Stufe wird gespeichert. Über **⟲ Versionen** lässt sich zu
  einem früheren Stand zurückspringen und von dort weiterbauen. Der Stand bleibt
  über Neustarts erhalten.

## Voraussetzungen

- [Node.js](https://nodejs.org/) 18+
- Die **Claude CLI** muss installiert und angemeldet sein
  (`claude` muss im `PATH` erreichbar sein).

## Installation & Start

```bash
npm install
npm start
```

Zum Entwickeln mit geöffneten DevTools:

```bash
npm run dev
```

## Projektstruktur

```
src/
  main.js              Electron-Hauptprozess: Fenster, IPC, Aufruf der Claude CLI
  preload.js           Sichere Brücke (contextBridge) zum Renderer
  renderer/
    index.html         Grundlayout: Eingabefeld, Bühne, Versions-Panel
    styles.css         Oberfläche von Morphos selbst
    renderer.js        Ablauf: Eingabe → Generierung → Anzeige → Versionen
```

## Sicherheit

- Der Electron-Renderer läuft mit `contextIsolation`, `sandbox` und ohne
  `nodeIntegration`. Zugriff auf den Hauptprozess nur über eine minimale,
  explizit freigegebene Brücke.
- Die **generierte** App läuft in einem separaten Sandbox-iframe ohne
  `same-origin`-Rechte und ohne Netzwerkzugriff (alles inline, offline).

## Lizenz

MIT
