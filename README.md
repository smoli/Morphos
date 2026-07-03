# Morphos

**Eine Electron-App, die sich selbst weiterentwickelt.**

Beim Start wählt der Anwender ein **Verzeichnis**, in dem seine Apps liegen
(zuletzt genutzte Ordner werden gemerkt). Der **Desktop** zeigt dann für jede
dort gespeicherte App ein Icon; von hier lässt sich eine bestehende App öffnen
oder eine neue anlegen.

In einer App gibt es zunächst nur ein Eingabefeld. Der Anwender schreibt hinein,
*was die Anwendung sein soll* — ein Taschenrechner, ein Editor, eine
Tabellenkalkulation, ein Spiel. Ein LLM entwickelt daraufhin die Oberfläche und
die Funktionen **live** und bietet sie sofort an. Alle weiteren Eingaben
beziehen sich auf **diese** App und entwickeln sie weiter. Über den Desktop
geht es jederzeit zurück zur Übersicht.

Jede App wird als **eigener Ordner** im gewählten Verzeichnis gespeichert
(`<app>/app.json` mit voller Versionshistorie plus `index.html` als eigenständiges
Artefakt) und bleibt dauerhaft erhalten — sie wird beim Öffnen geladen, nicht neu
erzeugt.

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
- **Name & Icon:** Das LLM setzt im HTML einen `<title>` (App-Name) und ein
  `<meta name="morphos:icon">` (Emoji); daraus entstehen Name und Icon der
  Desktop-Kachel.
- **Versionen:** Jede Stufe wird pro App gespeichert. Über **⟲ Versionen** lässt
  sich zu einem früheren Stand zurückspringen und von dort weiterbauen. Der Stand
  bleibt über Neustarts erhalten.

## Architektur

```
electron/
  main.ts              Hauptprozess: Fenster, IPC, Claude CLI, Ordner-/App-Dateien
  preload.ts           Sichere Brücke (contextBridge) → window.morphos
src/
  core/                Framework-unabhängige, reine Logik (voll getestet)
    prompt.ts          Systemprompt + Zusammenbau des LLM-Prompts
    html.ts            Extraktion von HTML-Dokument, Titel und Icon
    app.ts             App-Identität: Slug/Id, Vorgaben für Name & Icon
    appfs.ts           Bridge-SDK (window.morphosFS) + Injektion + Dispatch
    fsaccess.ts        Dateisystem-Zugriff mit Pfad-Eingrenzung (nur Hauptprozess)
    permissions.ts     Berechtigungslogik je Funktion (Vorgaben, Dialog-Auswertung)
  services/
    host.ts            Injizierbarer Zugriff auf die Host-Brücke (für Tests)
  stores/
    workspace.ts       Pinia-Store: Verzeichnis, zuletzt genutzte Ordner, App-Liste
    app.ts             Pinia-Store: EINE geöffnete App (Historie, generate/revert)
  components/          Präsentations-Komponenten (Props rein, Events raus)
    PromptBar · WelcomeScreen · AppCanvas · HistoryList · TopBar · PermissionDialog
  views/
    StartView.vue      Startbildschirm: Ordnerauswahl + zuletzt genutzte Ordner
    DesktopView.vue    Desktop: Icon je App, „Neue App“, Löschen
    WorkspaceView.vue  Arbeitsansicht einer App (Entwurf bzw. laufende App)
    VersionsView.vue   Versionsübersicht der geöffneten App
  router/index.ts      Routen: / · /desktop · /app/new · /app/:id · /app/:id/versions
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

## Dateizugriff der Apps

Erzeugte Apps können optional **Dateien lesen und schreiben**. Pro Workspace legt
der Anwender auf dem Desktop einen **Datenordner** fest („📂 Datenordner der Apps“);
alle Apps dieses Workspace teilen sich diesen Ordner.

Im Sandbox-iframe steht dafür ein globales, asynchrones API bereit:

```js
await morphosFS.writeFile('notizen/heute.txt', 'Hallo');
const text     = await morphosFS.readFile('notizen/heute.txt');
const eintraege = await morphosFS.list('notizen');   // [{ name, path, isDir }]
const da        = await morphosFS.exists('notizen/heute.txt');
const info      = await morphosFS.stat('notizen/heute.txt'); // { exists, isDir, size, modified }
await morphosFS.mkdir('notizen');
await morphosFS.remove('notizen/heute.txt');
```

Alle Pfade sind **relativ** zum Datenordner. Der Hauptprozess grenzt jeden Pfad
strikt auf diesen Ordner ein (`core/fsaccess`: `confineWithin`) — `..` und absolute
Pfade können nicht ausbrechen. Ist kein Datenordner festgelegt, lehnt das API ab;
Apps bleiben dann rein im Speicher funktionsfähig.

### Berechtigungen je Funktion

Jede Funktion hat pro Workspace eine Berechtigung: **Fragen**, **Erlauben** (still)
oder **Ablehnen**. Vorgabe: Lesen/Auflisten/Prüfen/Info sind still erlaubt,
Schreiben/Ordner-anlegen/Löschen **fragen** beim ersten Aufruf nach.

Bei „Fragen“ erscheint ein Dialog mit vier Optionen — *Einmal erlauben*,
*Immer erlauben*, *Einmal ablehnen*, *Immer ablehnen*. Ein „Immer“-Entscheid wird
für den Workspace gemerkt, sodass die Funktion danach still erlaubt bzw. abgelehnt
wird. Vorab lässt sich alles auf dem **Desktop** unter „Berechtigungen der Apps“
je Funktion einstellen.

## Sicherheit

- Der Electron-Renderer läuft mit `contextIsolation` und ohne `nodeIntegration`.
  Zugriff auf den Hauptprozess nur über eine minimale, explizit freigegebene
  Brücke (`contextBridge` → `window.morphos`).
- Die **generierte** App läuft in einem separaten Sandbox-iframe ohne
  `same-origin`-Rechte und ohne Netzwerkzugriff (alles inline, offline).
- Der **Dateizugriff** der App läuft ausschließlich über eine kontrollierte
  `postMessage`-Brücke und ist im Hauptprozess strikt auf den vom Anwender
  gewählten Datenordner begrenzt (Schutz vor Pfad-Traversal).

## Lizenz

MIT
