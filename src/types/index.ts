/** Eine virtuelle Quelldatei einer App. Pfad mit "/" relativ zum App-Ordner, stets unter src/. */
export interface SourceFile {
  path: string;
  content: string;
}

/** Vom LLM gelieferte Änderungen: geänderte/neue Dateien plus gelöschte Pfade. */
export interface FileChanges {
  files: SourceFile[];
  deletions: string[];
}

/**
 * Ergebnis einer Generierung durch das LLM: der vollständige NEUE Quelldatei-Satz
 * (Änderungen bereits angewendet) plus das daraus gebündelte HTML-Artefakt.
 */
export type GenerateResult =
  | { ok: true; files: SourceFile[]; html: string }
  | { ok: false; error: string };

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
  icon: string;
  createdAt: number;
  updatedAt: number;
}

/** Geladene App: Manifest + Quelldateien + gebündeltes Artefakt (index.html). */
export interface AppData extends AppMeta {
  files: SourceFile[];
  html: string;
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
}

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
}

/** Metadaten zu einem Pfad. */
export interface FsStatInfo {
  exists: boolean;
  isDir: boolean;
  size: number;
  modified: number;
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

/** Ergebnis eines Speichervorgangs. */
export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Ergebnis der Ordnerauswahl (nativer Dialog). */
export interface FolderResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/**
 * Die vom Electron-Hauptprozess bereitgestellte Brücke. Im Renderer als
 * `window.morphos`; in Tests durch eine Attrappe ersetzbar.
 */
export interface MorphosHost {
  /**
   * Erzeugt bzw. verändert die App über die Claude CLI. `files` ist der aktuelle
   * Quelldatei-Satz (leer bei einer neuen App); zurück kommt der neue Satz plus
   * das gebündelte Artefakt.
   */
  generate(prompt: string, files: SourceFile[]): Promise<GenerateResult>;

  /** Öffnet den nativen Ordner-Auswahldialog. */
  chooseFolder(): Promise<FolderResult>;

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
}
