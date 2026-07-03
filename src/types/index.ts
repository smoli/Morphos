/** Ergebnis einer Generierung durch das LLM. */
export type GenerateResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

/** Eine Stufe in der Versionshistorie einer App. */
export interface HistoryEntry {
  id: string;
  prompt: string;
  html: string;
  time: number;
}

/** Kopfdaten einer App (ohne Historie) — für die Desktop-Übersicht. */
export interface AppMeta {
  /** Zugleich der Name des Unterordners im Arbeitsverzeichnis. */
  id: string;
  name: string;
  icon: string;
  createdAt: number;
  updatedAt: number;
}

/** Vollständige, persistierte App: Kopfdaten + Versionshistorie. */
export interface AppData extends AppMeta {
  activeId: string | null;
  history: HistoryEntry[];
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
  /** Erzeugt bzw. verändert das App-HTML über die Claude CLI. */
  generate(prompt: string, currentHtml: string): Promise<GenerateResult>;

  /** Öffnet den nativen Ordner-Auswahldialog. */
  chooseFolder(): Promise<FolderResult>;

  /** Lädt die App-übergreifenden Einstellungen (zuletzt genutzte Ordner). */
  loadSettings(): Promise<Settings>;
  /** Speichert die App-übergreifenden Einstellungen. */
  saveSettings(settings: Settings): Promise<SaveResult>;

  /** Listet alle Apps in einem Arbeitsverzeichnis auf. */
  listApps(folder: string): Promise<AppSummary[]>;
  /** Lädt eine einzelne App (oder null, wenn nicht vorhanden). */
  loadApp(folder: string, id: string): Promise<AppData | null>;
  /** Speichert eine App (legt den Unterordner bei Bedarf an). */
  saveApp(folder: string, app: AppData): Promise<SaveResult>;
  /** Löscht eine App samt ihres Unterordners. */
  deleteApp(folder: string, id: string): Promise<SaveResult>;

  /**
   * Führt eine Dateisystem-Operation einer App aus. `root` ist der für den
   * Workspace freigegebene Zugriffsordner; `req.path` ist relativ dazu und wird
   * im Hauptprozess strikt auf diesen Ordner eingegrenzt.
   */
  fs(root: string, req: FsRequest): Promise<FsResponse>;
}
