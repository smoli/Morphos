// Der Kachel-Baum ist Rechnung, keine Ablage — er steht darum in core/tiling;
// hier steht nur, dass die Einstellungen ihn merken (siehe core/tilelayout).
import type { TileTree } from '@/core/tiling';

/** Eine virtuelle Quelldatei einer App. Pfad mit "/" relativ zum App-Ordner, stets unter src/. */
export interface SourceFile {
  path: string;
  content: string;
}

/**
 * Womit eine App ihre Oberfläche baut: von Hand ("vanilla") oder mit der
 * eingebauten Bibliothek Preact + htm. Siehe core/framework.
 */
export type Framework = 'vanilla' | 'preact';

/**
 * Vom LLM gelieferte Änderungen: geänderte/neue Dateien plus gelöschte Pfade,
 * optional eine Mitteilung an den Anwender (Rückfrage oder Erläuterung).
 */
export interface FileChanges {
  files: SourceFile[];
  deletions: string[];
  say?: string;
}

/**
 * Die beiden mitwachsenden Dokumente einer App (Inhalt, leer = noch keines):
 * das Konzept (lebende Spezifikation, geht in jeden Prompt zurück) und die
 * Anleitung für den Anwender. Siehe core/docs.
 */
export interface AppDocs {
  concept: string;
  userdoc: string;
}

/** Vom LLM geliefertes Dokument-Update: nur die genannten Dokumente. */
export type DocChanges = Partial<AppDocs>;

/** Eine Nachricht im Dialog zwischen Anwender und LLM (pro App). */
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** Dateinamen mitgeschickter Referenzen (nur zur Anzeige). */
  attachments?: string[];
  /** Beschriftungen mitgeschickter markierter Elemente (nur zur Anzeige, siehe core/pick). */
  elements?: string[];
  time: number;
}

/** Eine vom Anwender gewählte Referenzdatei für den nächsten Wunsch. */
export interface Attachment {
  /** Absoluter Pfad (aus dem nativen Dialog). */
  path: string;
  name: string;
  kind: 'image' | 'text';
}

/**
 * Ein vom Anwender in der laufenden App markiertes Element (siehe core/pick).
 * Es beschreibt die Stelle so genau, dass das LLM sie im Quelltext wiederfindet:
 * am zuverlässigsten über `source` — den beim Bündeln gesetzten Quellort —, sonst
 * über Selektor, Text und Attribute.
 */
export interface ElementRef {
  /** Tag-Name in Kleinschreibung, z. B. "button". */
  tag: string;
  /** CSS-Pfad zum Element im Dokument der App. */
  selector: string;
  id?: string;
  classes?: string[];
  /** Sichtbarer Text des Elements (gekürzt). */
  text?: string;
  /** Quellort aus `data-morphos-src`: "src/index.html:12:5" — fehlt bei zur Laufzeit erzeugtem DOM. */
  source?: string;
  /** Größe und Position im Fenster der App, in Bildpunkten. */
  rect?: { x: number; y: number; w: number; h: number };
}

/**
 * Ergebnis einer Generierung durch das LLM. Bei Dateiänderungen kommt der
 * vollständige NEUE Quelldatei-Satz plus gebündeltes Artefakt zurück, dazu der
 * fortgeschriebene Stand der beiden Dokumente; `say` trägt eine etwaige
 * Rückfrage/Erläuterung. Eine reine Rückfrage hat KEINE files/html/docs — es
 * wird nichts committet.
 */
export type GenerateResult =
  | { ok: true; files?: SourceFile[]; html?: string; docs?: AppDocs; say?: string }
  | { ok: false; error: string };

/**
 * Ein Fortschrittsereignis eines laufenden Agentenlaufs — aus dem Strom der
 * Claude CLI abgeleitet, damit der Chat live zeigt, was der Agent gerade tut.
 */
export type AgentEvent =
  | { kind: 'start' }
  | { kind: 'think' }
  | { kind: 'tool'; name: string; detail?: string }
  | { kind: 'write'; path: string }
  | { kind: 'delete'; path: string }
  | { kind: 'say' }
  | { kind: 'done' };

/** Endergebnis eines Agentenlaufs: Roh-Antworttext oder Fehlermeldung. */
export type AgentResult = { ok: true; text: string } | { ok: false; error: string };

/** Eine Version aus der Git-Historie einer App. */
export interface VersionInfo {
  /** Commit-Hash (vollständig). */
  sha: string;
  /** Die Commit-Botschaft = der Wunsch des Anwenders. */
  prompt: string;
  /** Zeitpunkt in Millisekunden. */
  time: number;
}

/** Eine Stufe der ALTEN JSON-Versionshistorie — nur noch für die Migration zu Git. */
export interface LegacyHistoryEntry {
  id: string;
  prompt: string;
  html: string;
  time: number;
}

/** Kopfdaten einer App — als app.json im App-Ordner abgelegt (Manifest). */
export interface AppMeta {
  /** Zugleich der Name des Unterordners im Arbeitsverzeichnis. */
  id: string;
  name: string;
  /** Emoji (Vorgabe des LLM) oder ein vom Anwender gewähltes Bild als data:-URI. */
  icon: string;
  /**
   * Der Anwender hat das Icon selbst gesetzt: Keine Generierung überschreibt es
   * je wieder. Fehlt/false = das Icon stammt vom LLM.
   */
  iconCustom?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Geladene App: Manifest + Quelldateien + gebündeltes Artefakt (index.html). */
export interface AppData extends AppMeta {
  files: SourceFile[];
  html: string;
  /** Dialogverlauf der App (chat.json — von Git ausgenommen, kein Revert). */
  chat: ChatMessage[];
  /** Konzept und Anleitung der App (mitversioniert; fehlt bei Alt-Ständen). */
  docs?: AppDocs;
}

/** Kurzfassung einer App für die Desktop-Kacheln. */
export interface AppSummary extends AppMeta {
  versions: number;
}

/** App-übergreifende Einstellungen (im userData-Verzeichnis abgelegt). */
export interface Settings {
  /** Zuletzt genutzte Arbeitsverzeichnisse, neuestes zuerst. */
  recentFolders: string[];
  /**
   * Pro Arbeitsverzeichnis der Ordner, auf den die erzeugten Apps zugreifen
   * dürfen (gemeinsam für alle Apps des Workspace). Schlüssel = Workspace-Pfad.
   */
  accessRoots: Record<string, string>;
  /** Dateisystem-Berechtigungen je Operation, pro Workspace-Pfad. */
  permissions?: Record<string, FsPermissions>;
  /**
   * Freigegebene Bibliotheks-Quellen (global): Hostnamen ("cdn.jsdelivr.net")
   * oder https-URL-Präfixe ("https://cdn.jsdelivr.net/npm/"). Nur von hier darf
   * die Shell Bibliotheken laden (einmalig, gecacht, offline eingebettet).
   */
  libWhitelist?: string[];
  /** Darstellungsmodus des Desktops: Fenster, eine App zur Zeit, oder Kacheln. */
  uiMode?: UiMode;
  /**
   * Wie viele Agentenläufe höchstens gleichzeitig arbeiten dürfen (global, weil
   * es eine Claude-Anmeldung ist). Weitere Wünsche warten (siehe core/queue).
   */
  maxAgents?: number;
  /**
   * Frei abgelegte Kachel-Positionen auf dem Desktop: je Workspace-Pfad, je
   * App-Id. Was hier fehlt, ordnet das Raster an (siehe core/arrange).
   */
  iconPositions?: Record<string, Record<string, IconPos>>;
  /**
   * Die im Dock behaltenen Apps je Workspace-Pfad, in der Reihenfolge, in der
   * der Anwender sie dazugenommen hat (siehe core/favorites).
   */
  favorites?: Record<string, string[]>;
  /**
   * Die zuletzt offenen App-Fenster je Workspace-Pfad, von hinten nach vorn.
   * Beim nächsten Start kommt der Desktop damit zurück (siehe core/session).
   */
  sessions?: Record<string, SessionWindow[]>;
  /**
   * Der gemerkte Kachel-Baum je Workspace-Pfad: Gestalt und Verhältnisse der
   * Kacheln, mit App bzw. Ansicht in den Blättern statt der Fenster-Id. Beim
   * nächsten Start kommt die Anordnung damit zurück (siehe core/tilelayout).
   */
  tileLayouts?: Record<string, TileTree>;
  /**
   * Wie weit die Fuge zwischen zwei Kacheln ist, je Workspace-Pfad —
   * Bildpunkte zwischen 0 (lückenlos) und `MAX_TILE_GAP`. Was hier fehlt,
   * bekommt die Vorgabe (siehe core/tilesettings).
   */
  tileGaps?: Record<string, number>;
  /**
   * Legt eine Kachel ihre Titelleiste weg, bis der Zeiger an ihren oberen Rand
   * kommt, je Workspace-Pfad? Was hier fehlt, bekommt die Vorgabe (siehe
   * core/tilesettings).
   */
  tileChromeHides?: Record<string, boolean>;
  /**
   * Der Hintergrund der Desktop-Fläche je Workspace-Pfad. Was hier fehlt,
   * bekommt die Vorgabe (siehe core/wallpaper).
   */
  wallpapers?: Record<string, Wallpaper>;
  /**
   * Wie durchsichtig das Dock ist, je Workspace-Pfad — ein Anteil zwischen 0
   * (deckend) und 1 (durchsichtig). Was hier fehlt, bekommt die Vorgabe (siehe
   * core/transparency).
   */
  dockTransparencies?: Record<string, number>;
  /**
   * Wie dicht das Milchglas des Docks ist, je Workspace-Pfad — Bildpunkte
   * zwischen 0 (klares Glas) und `MAX_DOCK_BLUR`. Was hier fehlt, bekommt die
   * Vorgabe (siehe core/transparency).
   */
  dockBlurs?: Record<string, number>;
  /**
   * Legt das Dock sich aus dem Weg, je Workspace-Pfad? Was hier fehlt, bekommt
   * die Vorgabe (siehe core/dock).
   */
  dockAutohides?: Record<string, boolean>;
  /**
   * An welchem Rand das Dock steht, je Workspace-Pfad. Was hier fehlt, bekommt
   * die Vorgabe (siehe core/dock).
   */
  dockEdges?: Record<string, DockEdge>;
}

/**
 * Der Rand, an dem das Dock steht (c0063): unten wie am Mac — oder an einer der
 * beiden Seiten bzw. oben. Gemerkt je Arbeitsverzeichnis (siehe core/dock).
 */
export type DockEdge = 'bottom' | 'left' | 'right' | 'top';

/**
 * Der Hintergrund der Desktop-Fläche: eine Farbe, ein Verlauf zwischen zwei
 * Farben (Neigung in Grad) oder ein Bild als data:-URI (mitgespeichert, damit
 * es ohne die Quelldatei wieder da ist). Siehe core/wallpaper.
 */
export type Wallpaper =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'image'; image: string };

/** Position einer Desktop-Kachel in Bildpunkten, relativ zur Desktop-Fläche. */
export interface IconPos {
  x: number;
  y: number;
}

/**
 * Ein gemerktes Fenster einer Sitzung: welche App (oder welche Ansicht der
 * Schale), wo und wie. Titel und Icon fehlen mit Absicht — sie kommen beim
 * Öffnen aus dem Verzeichnis bzw. von der Schale.
 */
export interface SessionWindow {
  /** Die App — null bei einem Fenster der Schale (siehe core/system). */
  appId: string | null;
  /** Die Ansicht der Schale (Dateien, Einstellungen) — fehlt bei einer App. */
  systemId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  maximized: boolean;
}

/**
 * Desktop-Modus: mehrere überlappende Fenster, genau eine App im Vollbild —
 * oder lückenlose Kacheln, deren Zuschnitt der Teilungsbaum vorgibt (c0066,
 * siehe core/tiling). Was davon gilt, stutzt core/uimode zurecht.
 */
export type UiMode = 'windows' | 'single' | 'tiles';

/** Von den erzeugten Apps aufrufbare Dateisystem-Operationen. */
export type FsOp = 'read' | 'write' | 'list' | 'exists' | 'stat' | 'delete' | 'mkdir';

/** Berechtigungsmodus je Operation: fragen, still erlauben oder ablehnen. */
export type PermMode = 'ask' | 'allow' | 'deny';

/** Entscheidung des Anwenders im Berechtigungsdialog. */
export type PermDecision = 'allow-once' | 'allow-always' | 'deny-once' | 'deny-always';

/** Berechtigungen je Operation (fehlend = Vorgabe). */
export type FsPermissions = Partial<Record<FsOp, PermMode>>;

/** Ein Eintrag beim Auflisten eines Verzeichnisses. */
export interface FsEntry {
  name: string;
  /** Pfad relativ zum Zugriffsordner, mit "/" als Trenner. */
  path: string;
  isDir: boolean;
  /** Größe in Bytes; fehlt, wenn sie sich nicht ermitteln ließ. */
  size?: number;
  /** Letzte Änderung, ms seit Epoch (0/fehlend = unbekannt). */
  modified?: number;
  /** Erstellung, ms seit Epoch (0/fehlend = unbekannt — nicht jedes Dateisystem kennt sie). */
  created?: number;
}

/** Metadaten zu einem Pfad. */
export interface FsStatInfo {
  exists: boolean;
  isDir: boolean;
  size: number;
  modified: number;
  /** Erstellung, ms seit Epoch (0 = unbekannt). */
  created: number;
}

/** Anfrage einer App an das Dateisystem (Pfad relativ zum Zugriffsordner). */
export interface FsRequest {
  op: FsOp;
  path: string;
  data?: string;
}

/** Antwort auf eine FsRequest. */
export type FsResult = string | boolean | FsEntry[] | FsStatInfo | null;
export type FsResponse =
  | { ok: true; result?: FsResult }
  | { ok: false; error: string };

/**
 * Die Verwaltungs-Operationen der Schale: anlegen, umbenennen, verschieben,
 * kopieren und der Papierkorb. Sie sind ausdrücklich KEINE FsOp — eine erzeugte
 * App kann sie nicht anfragen (siehe core/appfs: ALLOWED_OPS), sie geschehen
 * allein auf Geheiß des Anwenders im Datei-Explorer.
 */
export type ShellFsOp =
  | 'newFolder'
  | 'rename'
  | 'move'
  | 'copy'
  | 'trash'
  | 'trashList'
  | 'restore'
  | 'emptyTrash';

/** Ein Verwaltungsauftrag; alle Pfade sind relativ zum Datenordner. */
export interface ShellFsRequest {
  op: ShellFsOp;
  /** Die Quelle bzw. der betroffene Eintrag (bei `restore`: die Papierkorb-Id). */
  path: string;
  /** Das Ziel: der neue Name (`rename`) bzw. der Zielordner (`move`, `copy`). */
  to?: string;
  /** Nur nach Rückfrage beim Anwender: ein vorhandenes Ziel überschreiben. */
  overwrite?: boolean;
}

/** Ein Eintrag im Papierkorb (siehe core/trash). */
export interface TrashEntry {
  id: string;
  name: string;
  from: string;
  deletedAt: number;
  isDir: boolean;
}

/**
 * Antwort auf einen Verwaltungsauftrag. `code: 'exists'` heißt: Am Ziel liegt
 * schon etwas — die Schale fragt dann nach und wiederholt mit `overwrite`.
 */
export type ShellFsResult = string | TrashEntry[] | number | null;
export type ShellFsResponse =
  | { ok: true; result?: ShellFsResult }
  | { ok: false; error: string; code?: 'exists' };

/** Die Dateidialoge, die die Shell für eine App zeichnet. */
export type DialogKind = 'open' | 'save' | 'directory';

/** Anfrage einer App an einen Dateidialog (alle Angaben optional und geprüft). */
export interface DialogRequest {
  kind: DialogKind;
  /** Startordner, relativ zum Datenordner ("" = der Datenordner selbst). */
  startDir: string;
  /** Erlaubte Dateiendungen ohne Punkt; leer = alle. */
  extensions: string[];
  /** Vorgeschlagener Dateiname (nur kind=save). */
  suggestedName?: string;
  /** Überschrift des Dialogs. */
  title?: string;
}

/** Antwort auf eine DialogRequest: relativer Pfad oder null bei Abbruch. */
export type DialogResponse =
  | { ok: true; result: string | null }
  | { ok: false; error: string };

/** Platzbedarf einer App: ihr Ordner im Arbeitsverzeichnis, in Bytes. */
export interface AppUsage {
  id: string;
  name: string;
  icon: string;
  bytes: number;
}

/**
 * Platzbedarf eines Arbeitsverzeichnisses: je App ihr Ordner (größte zuerst),
 * deren Summe und — sofern festgelegt — der Datenordner. Gerechnet wird im
 * Hauptprozess (siehe core/diskusage).
 */
export interface DiskUsage {
  apps: AppUsage[];
  appsBytes: number;
  data: { path: string; bytes: number } | null;
}

/** Antwort auf die Platzbedarfs-Anfrage. */
export type DiskUsageResult =
  | { ok: true; usage: DiskUsage }
  | { ok: false; error: string };

/**
 * Ergebnis der Anmeldung einer Ordner-Beobachtung: die Kennung des Beobachters
 * oder der Grund, warum nicht beobachtet wird (siehe core/watch).
 */
export type WatchResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Ergebnis eines Speichervorgangs. */
export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Ergebnis einer Icon-Änderung: das nun wirksame Icon (bei Erfolg). */
export interface IconResult {
  ok: boolean;
  icon?: string;
  error?: string;
}

/** Ergebnis der Ordnerauswahl (nativer Dialog). */
export interface FolderResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/** Die Antwort des Anwenders auf eine belegte App-Id beim Import (core/appimport). */
export type ImportChoice = 'copy' | 'replace' | 'cancel';

/**
 * Eine belegte Id: Die geholte App will dorthin, wo schon eine App liegt. Der
 * Klon wartet unter `token`, bis der Anwender sich entschieden hat.
 */
export interface ImportCollision {
  /** Kennzeichnet den wartenden Klon (für die Antwort). */
  token: string;
  /** Die Id, die beide beanspruchen. */
  id: string;
  /** Anzeigename der geholten App. */
  name: string;
  /** Anzeigename der App, die diese Id schon hat. */
  existingName: string;
  /** Die Id, unter der die geholte App als Kopie landen würde. */
  copyId: string;
}

/**
 * Ergebnis eines App-Imports aus einem Git-Repository: die eingeordnete App,
 * eine Rückfrage wegen belegter Id, ein Abbruch — oder ein Fehler.
 */
export interface ImportResult {
  ok: boolean;
  /** Id der eingeordneten App (bei Erfolg) — zugleich ihr Ordnername. */
  id?: string;
  /** Anzeigename der eingeordneten App (bei Erfolg). */
  name?: string;
  /** Gesetzt, wenn der Anwender gefragt werden muss (siehe ImportCollision). */
  collision?: ImportCollision;
  /** Der Anwender hat abgebrochen — kein Fehler, nur nichts passiert. */
  cancelled?: boolean;
  error?: string;
}

/**
 * Die vom Electron-Hauptprozess bereitgestellte Brücke. Im Renderer als
 * `window.morphos`; in Tests durch eine Attrappe ersetzbar.
 */
export interface MorphosHost {
  /** Betriebssystem des Hauptprozesses ('darwin' | 'win32' | 'linux' …). */
  platform?: string;

  /**
   * Erzeugt bzw. verändert die App über die Claude CLI. `files` ist der aktuelle
   * Quelldatei-Satz (leer bei einer neuen App), `docs` der aktuelle Stand von
   * Konzept und Anleitung (steuert die Generierung und wird fortgeschrieben),
   * `chat` der bisherige Dialog (für den Kontext), `attachments` mitgeschickte
   * Referenzdateien. Zurück kommen Dateiänderungen samt fortgeschriebener
   * Dokumente und/oder eine Rückfrage (`say`). `runId` markiert den Lauf, unter
   * dem seine Fortschrittsereignisse gemeldet werden. `framework` ist die im
   * Composer getroffene Wahl für eine NEUE App — eine bestehende bringt ihre
   * eigene mit (siehe core/framework). `elements` sind die in der laufenden App
   * markierten Elemente, auf die sich der Wunsch bezieht (siehe core/pick).
   */
  generate(
    prompt: string,
    files: SourceFile[],
    docs: AppDocs,
    chat: ChatMessage[],
    attachments: Attachment[],
    runId?: string,
    framework?: Framework,
    elements?: ElementRef[],
  ): Promise<GenerateResult>;

  /**
   * Abonniert die Fortschrittsereignisse laufender Agentenläufe; liefert eine
   * Abmeldefunktion. `runId` ordnet jedes Ereignis dem Lauf zu, der es
   * ausgelöst hat — mehrere Fenster können gleichzeitig generieren.
   * Optional: im Renderer-Test fehlt die Anbindung.
   */
  onAgentEvent?(cb: (runId: string, event: AgentEvent) => void): () => void;

  /**
   * Bricht einen laufenden Agentenlauf ab: Der Hauptprozess beendet den
   * `claude`-Kindprozess zu dieser Lauf-Id. Liefert false, wenn kein solcher
   * Lauf (mehr) bekannt ist. Optional: im Renderer-Test fehlt die Anbindung.
   */
  cancelAgent?(runId: string): Promise<boolean>;

  /** Öffnet den nativen Ordner-Auswahldialog. */
  chooseFolder(): Promise<FolderResult>;

  /** Öffnet den nativen Dateidialog für eine Referenzdatei (Bild oder Text). */
  chooseAttachment(): Promise<{ ok: boolean; attachment?: Attachment; error?: string }>;

  /**
   * Liest ein Bild aus der System-Zwischenablage (Cmd/Ctrl+V), speichert es als
   * temporäre Referenzdatei und gibt sie als Anhang zurück. Der Hauptprozess
   * liest die Zwischenablage nativ (Electron) und wandelt jedes Format nach PNG —
   * so funktionieren auch Screenshot-Tools, die TIFF ablegen (z. B. Shottr).
   */
  readClipboardImage(): Promise<{ ok: boolean; attachment?: Attachment; error?: string }>;

  /** Speichert den Dialogverlauf einer App (chat.json). */
  saveChat(folder: string, id: string, chat: ChatMessage[]): Promise<SaveResult>;

  /** Lädt die App-übergreifenden Einstellungen (zuletzt genutzte Ordner). */
  loadSettings(): Promise<Settings>;
  /** Speichert die App-übergreifenden Einstellungen. */
  saveSettings(settings: Settings): Promise<SaveResult>;

  /** Listet alle Apps in einem Arbeitsverzeichnis auf. */
  listApps(folder: string): Promise<AppSummary[]>;
  /** Lädt eine einzelne App (oder null, wenn nicht vorhanden). Migriert Alt-Format zu Git. */
  loadApp(folder: string, id: string): Promise<AppData | null>;
  /** Speichert eine App und übernimmt den Stand als Git-Commit (message = Wunsch). */
  saveApp(folder: string, app: AppData, message: string): Promise<SaveResult>;
  /** Löscht eine App samt ihres Unterordners. */
  deleteApp(folder: string, id: string): Promise<SaveResult>;

  /**
   * Setzt das Icon einer App im Manifest — Emoji oder Bild als data:-URI — und
   * merkt es als Wahl des Anwenders vor. `null` setzt auf die Vorgabe zurück
   * (das Emoji, das das LLM im Artefakt hinterlegt hat). Läuft ohne die App zu
   * laden, gilt also auch für geschlossene Apps. Zurück kommt das wirksame Icon.
   */
  setAppIcon(folder: string, id: string, icon: string | null): Promise<IconResult>;

  /**
   * Holt eine App aus einem Git-Repository in das Arbeitsverzeichnis: klonen
   * (mit Historie und `origin`), als Morphos-App prüfen, einordnen. Ist die Id
   * schon belegt, kommt statt der App eine Rückfrage zurück (`collision`) —
   * beantwortet wird sie mit `resolveImport`. Optional: im Renderer-Test fehlt
   * die Anbindung, dann lässt sich nichts holen.
   */
  importApp?(folder: string, url: string): Promise<ImportResult>;

  /**
   * Beantwortet eine belegte Id: als Kopie unter neuer Id ablegen, die
   * vorhandene App ersetzen (das bestätigt die Schale zuvor) oder abbrechen.
   * Nach der Antwort ist der wartende Klon in jedem Fall aufgeräumt.
   */
  resolveImport?(token: string, choice: ImportChoice): Promise<ImportResult>;

  /** Liefert die Git-Versionshistorie einer App, neueste zuerst. */
  listVersions(folder: string, id: string): Promise<VersionInfo[]>;
  /** Stellt den Stand einer früheren Version als NEUEN Commit wieder her (linear, nichts geht verloren). */
  revertApp(folder: string, id: string, sha: string): Promise<SaveResult>;

  /**
   * Führt eine Dateisystem-Operation einer App aus. `root` ist der für den
   * Workspace freigegebene Zugriffsordner; `req.path` ist relativ dazu und wird
   * im Hauptprozess strikt auf diesen Ordner eingegrenzt.
   */
  fs(root: string, req: FsRequest): Promise<FsResponse>;

  /**
   * Führt eine Verwaltungs-Operation des ANWENDERS im Datenordner aus — anlegen,
   * umbenennen, verschieben, kopieren, Papierkorb (core/fsaccess: runShellFs).
   * Dieselbe Eingrenzung wie jeder Dateizugriff, aber kein App-Weg dorthin: Der
   * Datei-Explorer ruft das, eine erzeugte App kann es nicht anfragen. Optional:
   * im Renderer-Test fehlt die Anbindung, dann verwaltet der Explorer nicht.
   */
  shellFs?(root: string, req: ShellFsRequest): Promise<ShellFsResponse>;

  /**
   * Lässt einen Ordner im Datenordner vom Hauptprozess beobachten und ruft
   * `onChange` auf, wenn sich dort etwas getan hat (gebündelt, siehe
   * core/watch). `path` ist relativ zu `root` und wird wie jeder Pfad
   * eingegrenzt. Zurück kommt die Abmeldefunktion — sie beendet die
   * Beobachtung; ohne sie endet sie spätestens mit dem Fenster. Optional: im
   * Renderer-Test fehlt die Anbindung, dann läuft die Ansicht eben nicht mit.
   */
  watchFolder?(root: string, path: string, onChange: () => void): Promise<() => void>;

  /**
   * Ermittelt den Platzbedarf eines Arbeitsverzeichnisses: je App ihr Ordner
   * und der zugehörige Datenordner. Gerechnet wird im Hauptprozess — der
   * Renderer läuft nie selbst über das Dateisystem. Optional: im
   * Renderer-Test fehlt die Anbindung.
   */
  diskUsage?(folder: string): Promise<DiskUsageResult>;

  // ---- Steuerung des rahmenlosen Electron-Fensters (optional; im Renderer/Test
  //      fehlt die Anbindung — die Titelleiste ruft daher defensiv mit ?. auf) ----
  /** Minimiert das Programmfenster. */
  minimizeWindow?(): Promise<void>;
  /** Maximiert das Programmfenster bzw. stellt es wieder her. */
  toggleMaximizeWindow?(): Promise<void>;
  /** Schließt das Programmfenster. */
  closeWindow?(): Promise<void>;
  /** Aktueller Maximierungszustand des Programmfensters. */
  isWindowMaximized?(): Promise<boolean>;
  /** Abonniert Änderungen des Maximierungszustands; liefert eine Abmeldefunktion. */
  onWindowMaximize?(cb: (maximized: boolean) => void): () => void;
}
