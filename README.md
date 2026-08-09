# Morphos

**Eine Electron-App, die sich selbst weiterentwickelt.**

Beim Start wählt der Anwender ein **Verzeichnis**, in dem seine Apps liegen
(zuletzt genutzte Ordner werden gemerkt). Der **Desktop** zeigt dann für jede
dort gespeicherte App ein Icon; von hier lässt sich eine bestehende App öffnen
oder eine neue anlegen. Apps öffnen sich als **frei bewegliche, überlappende
Fenster** auf dem Desktop — mehrere gleichzeitig, jedes mit eigener Titelleiste
(Ziehen, Größe ändern, Maximieren, Versionen, Minimieren in den Dock, Schließen).
Über die Kopfleiste lässt sich zwischen **Fenster-Modus** und **Einzel-Modus**
(eine App im Vollbild) umschalten. Die Eingabe liegt als **globale Promptleiste**
am unteren Rand und bezieht sich stets auf das **aktive Fenster**.

Das Programmfenster selbst ist **rahmenlos** mit eigener Titelleiste
(Ziehbereich). Die Fensterknöpfe sind **betriebssystemgerecht**: unter macOS die
nativen Ampel-Knöpfe links, unter Windows/Linux eigene Minimieren/Maximieren/
Schließen-Knöpfe rechts. Datenordner, Berechtigungen und Bibliotheks-Freigaben
liegen hinter dem **⚙ Einstellungen**-Knopf in der Kopfleiste.

In einer App gibt es zunächst nur ein Eingabefeld. Der Anwender schreibt hinein,
*was die Anwendung sein soll* — ein Taschenrechner, ein Editor, eine
Tabellenkalkulation, ein Spiel. Ein LLM entwickelt daraufhin die Oberfläche und
die Funktionen **live** und bietet sie sofort an. Alle weiteren Eingaben
beziehen sich auf **diese** App und entwickeln sie weiter — als **Dialog**: Das
Eingabefeld lässt sich zu einem Chat aufklappen, das LLM kann Rückfragen
stellen, und Referenzdateien (Screenshots, Textvorlagen) lassen sich anhängen.
Über den Desktop geht es jederzeit zurück zur Übersicht.

Jede App wird als **eigener Ordner** im gewählten Verzeichnis gespeichert und ist
zugleich ein **eigenes Git-Repository**: `app.json` (Manifest), `src/` (die
Quelldateien, die das LLM bearbeitet), `index.html` als eigenständig öffenbares,
gebündeltes Artefakt sowie `concept.md` und `userdocumentation.md` — die beiden
vom LLM gepflegten Dokumente der App. Jede Generierung wird ein Commit — die Botschaft ist der
Wunsch des Anwenders. Apps bleiben dauerhaft erhalten und werden beim Öffnen
geladen, nicht neu erzeugt; Apps im alten JSON-Historienformat werden beim ersten
Öffnen automatisch nach Git migriert.

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
- **Quelldatei-Modell:** Eine App besteht aus Quelldateien unter `src/`
  (Einstieg: `src/index.html`, daneben z. B. `style.css`, `app.js`, …). Das LLM
  liefert Änderungen **inkrementell** als markierte Datei-Blöcke
  (`===MORPHOS:FILE …===` / `===MORPHOS:DELETE …===`) — nur geänderte Dateien,
  jede aber vollständig. Das hält auch große Apps schnell und schützt
  unveränderte Features vor versehentlichem Umschreiben.
- **Bündeln & Rendering:** Die Shell bündelt die Quellen zu **einem** in sich
  geschlossenen HTML-Dokument (`core/bundle`): verlinkte Stylesheets und Skripte
  werden inline eingebettet. Es läuft isoliert in einem **Sandbox-iframe**
  (`allow-scripts`, ohne `same-origin`) — der generierte Code kann die Host-App
  nicht erreichen. Eine injizierte **Content-Security-Policy**
  (`default-src 'none'`) blockiert zusätzlich jeden Netzwerkzugriff.
- **Bibliotheken (freigegebene Quellen):** Eine App darf JS-Bibliotheken per
  `<meta name="morphos:lib" content="https://…">` deklarieren — aber nur von
  Quellen, die der Anwender auf dem Desktop unter „Bibliotheken der Apps“
  freigegeben hat (Hostname oder https-URL-Präfix). Die **Shell** lädt die
  Bibliothek **einmalig**, cacht sie lokal und bettet sie beim Bündeln inline ein.
  Die laufende App bleibt vollständig offline.
- **Dialog statt Einzeiler:** Die Eingabe unten ist ein aufklappbarer **Chat**
  (mehrzeilig; Enter sendet, Shift+Enter bricht um). Der aufgeklappte Verlauf
  liegt als **Overlay** über der App (verkleinert sie nicht); Antworten des LLM
  werden als **Markdown** gerendert (escape-first, kein Markup aus dem Modell).
  Über ⧉ wandert der Chat in ein **eigenes Fenster** (gleicher Zustand, per
  Portal — kein zweiter Renderer); Schließen des Fensters dockt ihn wieder an.
  Ist ein Wunsch unklar, kann das LLM eine **Rückfrage** stellen
  (`===MORPHOS:SAY===`) — dann wird nichts committet, der Chat öffnet sich
  automatisch und die Antwort führt den Wunsch fort. Der Verlauf wird pro App
  gespeichert (`chat.json`, bewusst **nicht** versioniert — ein Revert spult
  das Gespräch nicht zurück) und als Kontext an jede Generierung mitgegeben.
- **Referenzdateien:** Über 📎 lassen sich Dateien als Referenz anhängen —
  Screenshots/Bilder (liest die Claude CLI selbst; `Read` wird nur für genau
  diese Pfade freigegeben) und Textdateien (werden in den Prompt eingebettet,
  max. 100 KB). Bilder lassen sich auch direkt mit **Cmd/Ctrl+V** aus der
  Zwischenablage in die Eingabe einfügen (sie landen als temporäre Datei).
  Es sind nur Pfade zulässig, die der Anwender selbst gewählt bzw. eingefügt hat.
- **Konzept & Anleitung:** Neben ihren Quellen führt jede App zwei mitwachsende
  Dokumente im App-Ordner: `concept.md` — die **lebende Spezifikation** (Zweck,
  Aufbau, Entscheidungen), die als Kontext in **jeden** Prompt zurückgeht und die
  App über den Dialog hinaus zusammenhält — und `userdocumentation.md`, die
  **Anleitung für den Anwender**. Beide entstehen in **derselben Generierung**
  wie die Änderung (als Datei-Blöcke; außerhalb von `src/` sind genau diese zwei
  Pfade zulässig), sind **mitversioniert** (ein Revert holt sie mit zurück) und
  werden **nicht** in das Artefakt gebündelt. Über 📄 in der Fenster-Titelleiste
  lassen sie sich als **Nur-Lese-Ansicht** lesen (Markdown, escape-first).
- **Name & Icon:** Das LLM setzt in `src/index.html` einen `<title>` (App-Name)
  und ein `<meta name="morphos:icon">` (Emoji); daraus entstehen Name und Icon
  der Desktop-Kachel.
- **Versionen = Git-Historie:** Jede Generierung ist ein Commit (Botschaft =
  Wunsch). Über **⟲ Versionen** in der Fenster-Titelleiste lässt sich ein
  früherer Stand wiederherstellen — als **neuer Commit** mit dem alten Baum:
  Die Historie bleibt linear, nichts geht je verloren. Der Stand bleibt über
  Neustarts erhalten.
- **Mehrere Apps gleichzeitig:** Der Desktop ist ein Fenstermanager im Renderer.
  Jedes App-Fenster ist eine unabhängige Instanz (eigener Zustand, eigener
  Chat, eigenes Sandbox-iframe). Beim Ziehen/Größenändern legt sich kurz eine
  unsichtbare Schutzschicht über die iframes, damit sie die Maus nicht
  „schlucken“. Eine erneut geöffnete App holt ihr bestehendes Fenster nach vorn,
  statt es zu duplizieren.

## Architektur

```
electron/
  main.ts              Hauptprozess: Fenster, IPC, Claude CLI, Ordner-/App-Dateien
  preload.ts           Sichere Brücke (contextBridge) → window.morphos
  libcache.ts          Tier-1-Bibliotheken: einmalig laden (Whitelist), cachen
src/
  core/                Framework-unabhängige, reine Logik (voll getestet)
    prompt.ts          Systemprompt + Zusammenbau des LLM-Prompts
    files.ts           Datei-Blockformat: serialisieren/parsen, Pfad-Validierung
    docs.ts            Die zwei Dokumente je App: Pfade, Abtrennen, Fortschreiben
    bundle.ts          Bündelt Quelldateien + Bibliotheken zu EINEM Dokument
    libs.ts            morphos:lib-Extraktion + Whitelist-Abgleich
    gitstore.ts        Git je App: init, commit, log, Wiederherstellen (System-Git)
    appstore.ts        App-Ablage: Manifest, src/, Artefakt, Dokumente, Migration
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
    WindowFrame · ChatDock · WelcomeScreen · AppCanvas · HistoryList · DocsPanel
    TopBar (Titelleiste) · SettingsDialog · PermissionDialog
  views/
    StartView.vue      Startbildschirm: Ordnerauswahl + zuletzt genutzte Ordner
    DesktopView.vue    Desktop: Launcher, App-Fenster, Dock, globale Promptleiste
  stores/
    desktop.ts         Fenster-Registry (Geometrie, z-Ordnung, Fokus, Maximieren)
  router/index.ts      Routen: / · /desktop (Apps sind Fenster, keine Route)
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
- **Git** muss installiert sein (`git` im `PATH`) — jede App ist ihr eigenes
  Repository.

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
der Anwender unter **⚙ Einstellungen** einen **Datenordner** fest; alle Apps dieses
Workspace teilen sich diesen Ordner.

Im Sandbox-iframe steht dafür ein globales, asynchrones API bereit:

```js
await morphosFS.writeFile('notizen/heute.txt', 'Hallo');
const text     = await morphosFS.readFile('notizen/heute.txt');
const eintraege = await morphosFS.list('notizen');   // [{ name, path, isDir, size, modified, created }]
const da        = await morphosFS.exists('notizen/heute.txt');
const info      = await morphosFS.stat('notizen/heute.txt'); // { exists, isDir, size, modified, created }
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
wird. Vorab lässt sich alles unter **⚙ Einstellungen** je Funktion einstellen.

## Sicherheit

- Der Electron-Renderer läuft mit `contextIsolation`, ohne `nodeIntegration`
  und in der **Chromium-Sandbox** (`sandbox: true`; das Preload wird dafür als
  CommonJS gebaut). Zugriff auf den Hauptprozess nur über eine minimale,
  explizit freigegebene Brücke (`contextBridge` → `window.morphos`).
- Die **generierte** App läuft in einem separaten Sandbox-iframe ohne
  `same-origin`-Rechte und ohne Popups. Der Offline-Betrieb wird durch eine
  injizierte **Content-Security-Policy** erzwungen (`default-src 'none'`;
  Skripte/Styles nur inline, Bilder/Medien nur als `data:`/`blob:`) — die
  iframe-Sandbox allein würde Netzwerk-Requests nicht verhindern.
- Der **Dateizugriff** der App läuft ausschließlich über eine kontrollierte
  `postMessage`-Brücke und ist im Hauptprozess strikt auf den vom Anwender
  gewählten Datenordner begrenzt: Pfade werden lexikalisch eingegrenzt
  (`confineWithin`), **Symlinks** real aufgelöst und bei Ausbruch abgelehnt,
  und als Wurzel akzeptiert der Hauptprozess nur Ordner, die der Anwender
  zuvor per Dialog freigegeben hat (gespeicherte `accessRoots`).

## Lizenz

MIT
