# Morphos

**Eine Electron-App, die sich selbst weiterentwickelt.**

Beim Start wählt der Anwender ein **Verzeichnis**, in dem seine Apps liegen
(zuletzt genutzte Ordner werden gemerkt). Der **Desktop** zeigt dann für jede
dort gespeicherte App ein Icon; von hier lässt sich eine bestehende App öffnen
oder eine neue anlegen. Apps öffnen sich als **frei bewegliche, überlappende
Fenster** auf dem Desktop — mehrere gleichzeitig, jedes mit eigener Titelleiste
(Ziehen, Größe ändern, Maximieren, Versionen, Minimieren in den Dock, Schließen).
In den **Einstellungen** (Bereich „Darstellung“) lässt sich zwischen
**Fenster-Modus**, **Einzel-Modus** (eine App im Vollbild) und **Kacheln**
(lückenlos geteilte Fläche) umschalten. Die Eingabe gehört der App, nicht dem
Desktop: Jedes App-Fenster trägt einen **Chat**, der über 💬 in seiner
Titelleiste (oder Strg/⌘ + ⇧ + C) unten am Fenster aufgeht und mit Escape
wieder zu.

Das Programmfenster selbst ist **rahmenlos** mit eigener Titelleiste
(Ziehbereich). Die Fensterknöpfe sind **betriebssystemgerecht**: unter macOS die
nativen Ampel-Knöpfe links, unter Windows/Linux eigene Minimieren/Maximieren/
Schließen-Knöpfe rechts. Datenordner, Berechtigungen und Bibliotheks-Freigaben
liegen hinter dem **⚙ Einstellungen**-Knopf in der Kopfleiste.

Eine neue App öffnet sich mit offenem Chat — sie hat ja noch nichts zu zeigen.
Der Anwender schreibt hinein, *was die Anwendung sein soll* — ein
Taschenrechner, ein Editor, eine Tabellenkalkulation, ein Spiel. Ein LLM
entwickelt daraufhin die Oberfläche und die Funktionen **live** und bietet sie
sofort an. Alle weiteren Eingaben beziehen sich auf **diese** App und entwickeln
sie weiter — als **Dialog**: Der Chat trägt den Verlauf, das LLM kann Rückfragen
stellen (dann geht er von selbst auf), und Referenzdateien (Screenshots,
Textvorlagen) lassen sich anhängen. Arbeitet ein Agent bei geschlossenem Chat,
zeigt das ein Punkt in der Titelleiste und im Dock. Über den Desktop geht es
jederzeit zurück zur Übersicht.

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
- **Vue Router** — Navigation (Start ⇄ Desktop)
- **Vite** — Build (Renderer + Electron Haupt-/Preload-Prozess)
- **Vitest** + **@vue/test-utils** — Tests (strikt nach TDD entwickelt)

## Wie es funktioniert

```
┌────────────────────────────┐        ┌──────────────────────┐
│  Morphos (Electron + Vue)  │        │  Claude CLI          │
│                            │ prompt │  (claude -p)         │
│  Chat der App ──────────────────────▶  erzeugt/ändert die  │
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
- **Preact eingebaut (optional):** Für zustandsreiche Apps steht **Preact + htm**
  als eingebaute Bibliothek bereit — im Chat beim **Anlegen einer neuen App** per
  Schalter wählbar (Vorgabe: an). Es kommt **CSP-sauber** ohne `eval` und ohne
  Build-Schritt aus (htm ist ein Tagged-Template-Parser); die App nutzt dann die
  Globalen `preact`, `preactHooks` und `html` (JSX-artige Templates). Ohne den
  Schalter bleibt die App reines Vanilla-JS; die Wahl wird je App gemerkt.
- **Dialog statt Einzeiler:** Der Chat gehört **einer App** und hängt an **ihrem
  Fenster**: 💬 in der Titelleiste bzw. Strg/⌘ + ⇧ + C klappt ihn unten auf,
  Escape schließt ihn; nach dem Senden bleibt er offen. Er trägt Verlauf,
  Eingabe (mehrzeilig; Enter sendet, Shift+Enter bricht um), Anhänge und den
  Fortschritt des laufenden Laufs und legt sich als Leiste **über** den unteren
  Teil der App, statt sie zu verkleinern. Ein neues Fenster bringt ihn offen
  mit — ein Entwurf hat noch nichts zu zeigen. Antworten des LLM werden als
  **Markdown** gerendert (escape-first, kein Markup aus dem Modell). Über ⧉
  wandert der Chat in ein **eigenes Fenster** (gleicher Zustand, per Portal —
  kein zweiter Renderer); Schließen des Fensters dockt ihn wieder an. Ist ein
  Wunsch unklar, kann das LLM eine **Rückfrage** stellen (`===MORPHOS:SAY===`)
  — dann wird nichts committet, der Chat öffnet sich von selbst (auch aus dem
  Zu heraus) und die Antwort führt den Wunsch fort. Der Verlauf wird pro App
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
  der Desktop-Kachel. Der Anwender kann das Icon jederzeit überschreiben (Emoji
  **oder** ein eigenes Bild) — ein selbst gesetztes Icon bleibt bei
  Folge-Generierungen erhalten.
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
- **Agenten (parallel + Warteschlange):** Wie viele Wünsche gleichzeitig
  bearbeitet werden dürfen, ist einstellbar (Vorgabe 2); alles darüber wartet in
  der Reihenfolge des Eingangs — für eine App arbeitet ohnehin nie mehr als ein
  Agent. Ein Lauf kann abgebrochen werden.

## Der Desktop – wie ein Betriebssystem

Der Desktop ist ein vollwertiger Fenstermanager im Renderer, kein bloßer
Startbildschirm:

- **Dock:** Am unteren Rand liegt ein Dock im macOS-Stil — links das feste
  **＋ Neue App**, dann angeheftete **Favoriten** (bleiben, auch geschlossen),
  dann die **laufenden** Apps (mit Laufanzeige). Ein Klick holt eine App nach
  vorn bzw. stellt sie wieder her. Transparenz, Weichzeichnen und automatisches
  Ausblenden sind einstellbar.
- **Startmenü / Suche:** **Strg/⌘ + K** öffnet ein durchsuchbares Startmenü —
  Tippen filtert die Apps, ↑/↓ und Enter öffnen (eine laufende kommt nach vorn),
  samt „Neue App“.
- **Hintergrund:** Pro Workspace ein **Hintergrundbild**, eine Farbe oder ein
  Verlauf.
- **Desktop-Icons:** Die App-Icons liegen **rahmenlos** auf der Fläche, lassen
  sich **frei anordnen** (Position gemerkt) und per **Rechtsklick** verwalten
  (öffnen, Icon ändern, ins Dock, löschen).
- **Drei Darstellungen:** **Fenster** (frei, überlappend), **Einzeln** (eine App
  im Vollbild) und **Kacheln** — eine lückenlos geteilte Fläche nach Hyprlands
  „dwindle“: ein neues Fenster teilt die aktive Kachel (Richtung nach
  Seitenverhältnis), an den **Fugen ziehen** ändert die Größe, das **Ziehen der
  Titelleiste auf eine andere Kachel** tauscht die Plätze. Die Anordnung wird je
  Workspace gemerkt. Wie **weit die Fuge** ist und ob eine Kachel ihre
  **Titelleiste weglegt** (sie kommt hervor, sobald der Zeiger den oberen Rand
  erreicht), steht in den Einstellungen unter „Darstellung“.
- **Sitzung:** Welche Fenster offen waren und wo, kommt beim nächsten Start
  zurück (auch die Kachel-Anordnung).
- **Tastenkürzel:** neue App, Schließen/Minimieren/Maximieren, Einstellungen,
  Startmenü, Chat — plus **Strg/⌘ + Tab** als Fensterwechsler.
- **Mitteilungen:** kurze Einblendungen (Agent fertig, Fehler …) über dem
  Desktop.
- **Datei-Explorer:** ein eigenes **Systemfenster „Dateien“** zeigt den
  Datenordner (live aktualisiert, streng eingegrenzt) mit **Vorschau**
  (Bild/Video/Ton/Markdown/JSON/Text; HTML und SVG in einer eigenen Sandbox) und
  voller **Verwaltung** (anlegen, umbenennen, verschieben, kopieren) samt
  **Papierkorb** — Gelöschtes bleibt im Datenordner und wiederherstellbar.
- **Telemetrie:** in den Einstellungen zeigt Morphos die **Agenten-Auslastung**
  und den **Platzbedarf** der Apps und des Datenordners.

## Architektur

```
electron/
  main.ts              Hauptprozess: Fenster, IPC, Claude CLI, App-Dateien,
                       Datei-Explorer, Datenstrom (morphos-file://), Preact eingebaut
  preload.ts           Sichere Brücke (contextBridge) → window.morphos
  mcp-server.ts        Der stdio-MCP-Server für einen Agentenlauf (Hülle um core/mcp)
  libcache.ts          Tier-1-Bibliotheken: einmalig laden (Whitelist), cachen
src/
  core/                Framework-unabhängige, reine Logik (voll getestet)
    prompt.ts          Systemprompt + Zusammenbau des LLM-Prompts
    files.ts           Datei-Blockformat: serialisieren/parsen, Pfad-Validierung
    docs.ts            Die zwei Dokumente je App: Pfade, Abtrennen, Fortschreiben
    bundle.ts          Bündelt Quelldateien + Bibliotheken zu EINEM Dokument
    libs.ts · framework.ts   morphos:lib + Whitelist · Preact-Schalter je App
    gitstore.ts        Git je App: init, commit, log, Wiederherstellen (System-Git)
    appstore.ts        App-Ablage: Manifest, src/, Artefakt, Dokumente, Migration
    agent.ts · queue.ts      Agentenlauf (Strom der CLI) + Warteschlange/Parallel-Deckel
    mcp.ts             Werkzeuge für den Agenten (write/edit/delete/ask): MCP-Protokoll,
                       Pfad-Grenze, Lauf-Protokoll, Aufruf der CLI
    html.ts · markdown.ts · icon.ts   HTML/Titel/Icon · Markdown (escape-first) · Icons
    app.ts             App-Identität: Slug/Id, Vorgaben für Name & Icon
    appfs.ts           Bridge-SDK (window.morphosFS) + CSP + Dispatch
    fsaccess.ts        Dateizugriff, Pfad-Eingrenzung, Verwalten (runShellFs)
    trash.ts · dialog.ts     Papierkorb-Regeln · scoped Dateidialoge
    filelink.ts · preview.ts · watch.ts · diskusage.ts
                       Datei-Explorer: Strom, Vorschau-Regeln, Ordner-Beobachtung, Platz
    tiling.ts · tilelayout.ts · tilesettings.ts
                       Kachel-Baum (dwindle) · Persistenz je Workspace · Fuge/Titelleiste
    uimode.ts · arrange.ts · dock.ts · favorites.ts · wallpaper.ts · session.ts
                       Darstellung · Icon-Raster · Dock · Favoriten · Hintergrund · Sitzung
    launcher.ts · shortcuts.ts · switcher.ts · system.ts
                       Startmenü · Tastenkürzel · Fensterwechsler · Systemfenster
    permissions.ts     Berechtigungslogik je Funktion (Vorgaben, Dialog-Auswertung)
  services/
    host.ts            Injizierbarer Zugriff auf die Host-Brücke (für Tests)
  stores/
    workspace.ts       Verzeichnis, zuletzt genutzte Ordner, App-Liste, Einstellungen
    desktop.ts         Fenster-Registry (Geometrie/z/Fokus/Kacheln), Sitzung, Dock
    app.ts             EIN App-Fenster (Fabrik je Instanz): generate/revert/Chat
    agents.ts · notifications.ts   Warteschlange + laufende Agenten · Toast-Mitteilungen
  components/          Präsentations-Komponenten (Props rein, Events raus)
    WindowFrame · AppWindow · SystemWindow · ExplorerPanel · ChatDock · DocsPanel
    AppCanvas · WelcomeScreen · HistoryList · TopBar · TileGaps · ContextMenu
    LauncherOverlay · SwitcherOverlay · IconDialog · PermissionDialog · settings/*
  views/
    StartView.vue      Startbildschirm: Ordnerauswahl + zuletzt genutzte Ordner
    DesktopView.vue    Desktop: Launcher, Fenster, Dock, Kacheln, Startmenü, Hintergrund
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
- Der **Datei-Explorer** verwaltet nur INNERHALB des Datenordners: Verschieben,
  Kopieren, Umbenennen und Papierkorb (`runShellFs`) prüfen **Quelle und Ziel**
  über dieselbe Eingrenzung; der Vorschau-Datenstrom (`morphos-file://`) reicht
  nur eingegrenzte Pfade heraus und niemals aktive Inhalte. Diese Verwaltung ist
  eine **Anweisung des Anwenders**, keine App-Anfrage — Apps erreichen sie nicht,
  und der Papierkorb (`.trash`) ist für Apps unsichtbar.

## Lizenz

MIT
