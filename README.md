# Morphos

**Eine Electron-App, die sich selbst weiterentwickelt.**

Zu Beginn zeigt Morphos nur ein Eingabefeld. Der Anwender schreibt hinein, *was
die Anwendung sein soll* — ein Taschenrechner, ein Editor, eine
Tabellenkalkulation, ein Spiel. Ein LLM entwickelt daraufhin die Oberfläche und
die Funktionen **live** und bietet sie sofort an. Während der Verwendung lassen
sich jederzeit neue Ideen umsetzen: Jede Eingabe verändert und erweitert die
laufende App.

## Technologie

- **Electron** — Desktop-Rahmen
- **Vue 3** + **TypeScript** — Oberfläche (Composition API, `<script setup>`)
- **Pinia** — Zustandsverwaltung
- **Vue Router** — Navigation (Arbeitsansicht ⇄ Versionsübersicht)
- **Vite** — Build (Renderer + Electron Haupt-/Preload-Prozess)
- **Vitest** + **@vue/test-utils** — Tests (strikt nach TDD entwickelt)

## Wie es funktioniert

```
┌────────────────────────────┐        ┌──────────────────────┐
│  Morphos (Electron + Vue)  │        │  Claude CLI          │
│                            │ prompt │  (claude -p)         │
│  Promptleiste ──────────────────────▶  erzeugt/ändert die  │
│                            │        │  App als HTML-Dok.   │
│  Sandbox-iframe ◀───────────────────  vollständiges HTML   │
│  (zeigt die erzeugte App)  │  html  │                      │
└────────────────────────────┘        └──────────────────────┘
```

- **LLM-Anbindung:** Der Electron-Hauptprozess ruft die **Claude CLI** als
  Subprozess auf (`claude -p --output-format json`). Es wird **kein API-Key** in
  der App verwaltet — es zählt deine bestehende Claude-Anmeldung.
- **Rendering:** Das LLM liefert ein **komplettes, in sich geschlossenes
  HTML-Dokument** (HTML + CSS + JS inline). Es läuft isoliert in einem
  **Sandbox-iframe** (`allow-scripts`, ohne `same-origin`) — der generierte Code
  kann die Host-App nicht erreichen.
- **Weiterentwicklung:** Bei jeder neuen Eingabe wird das aktuelle Dokument
  mitgeschickt; das LLM entwickelt es weiter, statt bei Null zu beginnen.
- **Versionen:** Jede Stufe wird gespeichert. Über **⟲ Versionen** lässt sich zu
  einem früheren Stand zurückspringen und von dort weiterbauen. Der Stand bleibt
  über Neustarts erhalten.

## Architektur

```
electron/
  main.ts              Hauptprozess: Fenster, IPC, Aufruf der Claude CLI
  preload.ts           Sichere Brücke (contextBridge) → window.morphos
src/
  core/                Framework-unabhängige, reine Logik (voll getestet)
    prompt.ts          Systemprompt + Zusammenbau des LLM-Prompts
    html.ts            Extraktion des HTML-Dokuments aus der LLM-Ausgabe
  services/
    host.ts            Injizierbarer Zugriff auf die Host-Brücke (für Tests)
  stores/
    app.ts             Pinia-Store: Historie, aktuelle App, generate/revert
  components/          Präsentations-Komponenten (Props rein, Events raus)
    PromptBar · WelcomeScreen · AppCanvas · HistoryList · TopBar
  views/
    WorkspaceView.vue  Arbeitsansicht (Startbildschirm bzw. laufende App)
    VersionsView.vue   Versionsübersicht
  router/index.ts      Routen: / und /versions
  App.vue · main.ts    Wurzelkomponente & Einstiegspunkt des Renderers
```

Der Electron-Hauptprozess und der Renderer teilen sich denselben **Core**
(`src/core`) — dieselbe getestete Logik erzeugt den Prompt und bereinigt das HTML.

## Entwicklung nach TDD

Der Code wurde strikt testgetrieben entwickelt: erst der Test (rot), dann die
Implementierung (grün). Jede Schicht ist mit Vitest abgedeckt — reine Logik,
der Pinia-Store (mit injizierter Host-Attrappe), die Komponenten (mit
`@vue/test-utils`) sowie Router und Views.

```bash
npm test          # alle Tests einmalig ausführen
npm run test:watch
npm run typecheck # vue-tsc über das gesamte Projekt
```

## Voraussetzungen

- [Node.js](https://nodejs.org/) 18+
- Die **Claude CLI** muss installiert und angemeldet sein
  (`claude` muss im `PATH` erreichbar sein).

## Installation & Start

```bash
npm install
npm run dev      # startet Vite + Electron (Hot Reload)
```

Produktions-Build:

```bash
npm run build    # Typecheck + Bundle (Renderer & Electron)
npm start        # gebaute App starten
```

## Sicherheit

- Der Electron-Renderer läuft mit `contextIsolation` und ohne `nodeIntegration`.
  Zugriff auf den Hauptprozess nur über eine minimale, explizit freigegebene
  Brücke (`contextBridge` → `window.morphos`).
- Die **generierte** App läuft in einem separaten Sandbox-iframe ohne
  `same-origin`-Rechte und ohne Netzwerkzugriff (alles inline, offline).

## Lizenz

MIT
