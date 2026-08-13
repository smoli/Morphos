import fs from 'node:fs';
import path from 'node:path';
import { confineWithin, resolveWithin } from './fsaccess';
import { isValidOutputPath, isValidSourcePath } from './files';
import { CONCEPT_FILE, USERDOC_FILE } from './docs';
import { MCP_SERVER_NAME, mcpToolId, type McpToolName } from './mcptools';

/**
 * Der Werkzeugkasten, den Morphos dem Agenten für einen Lauf hinhält (c0088).
 *
 * Der Agent arbeitet unmittelbar auf dem App-Ordner. Gelesen wird mit den
 * eigenen Werkzeugen der Claude CLI (Read/Glob/Grep) — GESCHRIEBEN und GEFRAGT
 * wird ausschließlich hier, über einen stdio-MCP-Server, den Morphos für den
 * Lauf startet. Das hat zwei Gründe:
 *
 *   Grenze.   Jeder Pfad geht durch `writablePath` und landet damit sicher
 *             unter src/ oder in einem der beiden Dokumente der App. Der Server
 *             IST die Sandbox-Grenze; einen Wächter davor braucht es nicht.
 *   Zeugnis.  Morphos sieht jede Änderung und jede Rückfrage aus erster Hand:
 *             Der Server schreibt sie in ein Lauf-Protokoll (`journal`), aus dem
 *             die Schale danach abliest, ob committet wird (mindestens eine
 *             Änderung) oder ob der Lauf eine reine Rückfrage war.
 *
 * Dieses Modul ist die ganze Logik — Protokoll, Werkzeuge, Grenze. Der
 * eigentliche Prozess ist nur die Hülle darum (electron/mcp-server.ts).
 */

export const MCP_SERVER_VERSION = '0.1.0';

/** Die Fassung des MCP-Protokolls, die dieser Server spricht. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** Ältere Fassungen, die unverändert funktionieren — die CLI darf sie wählen. */
const KNOWN_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, '2025-03-26', '2024-11-05'];

/** Umgebungsvariablen, über die die Hülle Ordner und Protokolldatei mitbekommt. */
export const MCP_ROOT_ENV = 'MORPHOS_MCP_ROOT';
export const MCP_JOURNAL_ENV = 'MORPHOS_MCP_JOURNAL';

// Die Namen der Werkzeuge stehen für sich (core/mcptools): Sie kommen ohne
// Dateisystem aus, denn auch der Renderer liest an ihnen den Fortschritt ab.
export { MCP_SERVER_NAME, mcpToolId };
export type { McpToolName };

/* ------------------------------------------------------------------ *
 * Die Grenze
 * ------------------------------------------------------------------ */

/**
 * Der geprüfte, absolute Zielpfad eines Schreibvorgangs — oder null, wenn er
 * nicht in Frage kommt. Erlaubt sind Quelldateien unter src/ und GENAU die
 * beiden Dokumente der App (core/docs); alles andere — app.json, .git, der
 * Ordner selbst, ein Ausbruch über `..` oder einen absoluten Pfad — fällt durch.
 *
 * Ein absoluter Pfad, der bereits IM App-Ordner liegt, wird angenommen: Die CLI
 * arbeitet mit absoluten Pfaden, und was drinnen liegt, liegt drinnen. Alles
 * andere Absolute wird relativ zum Ordner betrachtet (core/fsaccess:
 * confineWithin) und scheitert damit an der Prüfung.
 */
export function writablePath(root: string, requested: unknown): string | null {
  const raw = typeof requested === 'string' ? requested.trim() : '';
  if (!raw) return null;

  const base = path.resolve(root);
  const rel = path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw) ? path.relative(base, path.resolve(raw)) : raw;
  const target = confineWithin(base, rel);
  if (target === null) return null;

  const inside = path.relative(base, target).split(path.sep).join('/');
  return isValidOutputPath(inside) ? target : null;
}

/** Der Pfad relativ zum App-Ordner, wie ihn das Protokoll führt (immer mit „/“). */
function insidePath(root: string, target: string): string {
  return path.relative(path.resolve(root), target).split(path.sep).join('/');
}

/**
 * Wie `writablePath`, aber zusätzlich real aufgelöst: Ein Symlink INNERHALB des
 * App-Ordners darf nicht nach draußen zeigen (core/fsaccess: resolveWithin).
 * Die lexikalische Prüfung bleibt die erste — sie ist es, die den Pfad überhaupt
 * auf src/ und die Dokumente eingrenzt.
 */
function writableTarget(root: string, requested: unknown): string | null {
  const target = writablePath(root, requested);
  if (target === null) return null;
  return resolveWithin(root, insidePath(root, target)) === null ? null : target;
}

/* ------------------------------------------------------------------ *
 * Das Protokoll des Laufs
 * ------------------------------------------------------------------ */

/** Was ein Lauf hinterlassen hat: geänderte und gelöschte Dateien, ggf. eine Rückfrage. */
export interface McpRunLog {
  writes: string[];
  deletions: string[];
  question: string | null;
}

export function emptyRunLog(): McpRunLog {
  return { writes: [], deletions: [], question: null };
}

/** Gab es Änderungen an der App? Eine reine Rückfrage zählt NICHT (c0087: kein Commit). */
export function wroteSomething(log: McpRunLog): boolean {
  return log.writes.length > 0 || log.deletions.length > 0;
}

/** Liest die Protokolldatei des Servers (eine JSON-Zeile je Vorgang). */
export function parseRunLog(text: string): McpRunLog {
  const log = emptyRunLog();
  for (const line of (text ?? '').split('\n')) {
    if (!line.trim()) continue;
    let note: { kind?: unknown; path?: unknown; question?: unknown };
    try {
      note = JSON.parse(line);
    } catch {
      continue; // Eine kaputte Zeile soll nicht das ganze Protokoll kippen.
    }
    const p = typeof note.path === 'string' ? note.path : '';
    if (note.kind === 'write' && p && !log.writes.includes(p)) log.writes.push(p);
    else if (note.kind === 'delete' && p && !log.deletions.includes(p)) log.deletions.push(p);
    else if (note.kind === 'ask' && typeof note.question === 'string' && log.question === null) {
      log.question = note.question;
    }
  }
  return log;
}

/* ------------------------------------------------------------------ *
 * Die Werkzeuge
 * ------------------------------------------------------------------ */

interface McpToolSpec {
  name: McpToolName;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

const PATH_HINT = `Pfad relativ zum App-Ordner, z. B. src/app.js. Erlaubt sind nur src/… sowie ${CONCEPT_FILE} und ${USERDOC_FILE}.`;

/** Was die CLI dem Modell über die Werkzeuge erzählt (Reihenfolge = Anzeige). */
export const MCP_TOOLS: readonly McpToolSpec[] = [
  {
    name: 'write',
    description:
      'Legt eine Datei der App an oder ersetzt sie vollständig. Fehlende Ordner entstehen mit. '
      + 'Für kleine Änderungen an bestehenden Dateien ist edit die bessere Wahl.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: PATH_HINT },
        content: { type: 'string', description: 'Der vollständige neue Inhalt der Datei.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit',
    description:
      'Ersetzt eine Textstelle in einer bestehenden Datei. old_text muss zeichengenau und '
      + 'eindeutig vorkommen — nimm genug Kontext dazu, sonst wird der Aufruf abgewiesen.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: PATH_HINT },
        old_text: { type: 'string', description: 'Die zu ersetzende Stelle, zeichengenau.' },
        new_text: { type: 'string', description: 'Was an ihre Stelle tritt (leer heißt: entfernen).' },
        replace_all: { type: 'boolean', description: 'Alle Vorkommen ersetzen statt genau eines.' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'delete',
    description: 'Löscht eine Quelldatei der App. Die beiden Dokumente der App lassen sich nicht löschen.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Pfad einer Datei unter src/.' } },
      required: ['path'],
    },
  },
  {
    name: 'ask',
    description:
      'Stellt dem Anwender eine Rückfrage, wenn der Wunsch ohne sie nicht zu erfüllen ist. '
      + 'Genau EINE Frage je Lauf, und danach ist der Lauf zu Ende: Der Anwender antwortet im Chat.',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Die Frage — kurz, konkret, in der Sprache des Anwenders.' } },
      required: ['question'],
    },
  },
];

/**
 * Was der Agent im Lauf benutzen darf: die Werkzeuge dieses Servers und die
 * LESENDEN Werkzeuge der CLI. Write/Edit/Bash der CLI stehen bewusst NICHT
 * dabei — geschrieben wird nur durch die Grenze hindurch.
 */
export const MCP_ALLOWED_TOOLS: readonly string[] = [
  ...MCP_TOOLS.map((t) => mcpToolId(t.name)),
  'Read',
  'Glob',
  'Grep',
];

/**
 * Was der Agent NICHT benutzen darf — ausdrücklich, nicht bloß mangels Freigabe.
 * Schreiben geht allein durch die Grenze dieses Servers; eine Schale („Bash“)
 * führte an ihr vorbei, und Netzzugriffe hat in einem Lauf niemand zu suchen.
 */
export const MCP_DENIED_TOOLS: readonly string[] = [
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Bash',
  'WebFetch',
  'WebSearch',
];

/* ------------------------------------------------------------------ *
 * Der Server
 * ------------------------------------------------------------------ */

type JsonRpcId = string | number | null;

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Das Ergebnis eines Werkzeugaufrufs, wie MCP es erwartet. */
interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface McpServer {
  /** Beantwortet eine Nachricht; null heißt: Benachrichtigung, es gibt nichts zu antworten. */
  handle(message: unknown): JsonRpcResponse | null;
  /** Was der Lauf bisher hinterlassen hat. */
  log(): McpRunLog;
}

export interface McpServerOptions {
  /** Der App-Ordner — die Grenze, aus der kein Schreibvorgang hinausführt. */
  root: string;
  /** Datei, in die jeder Vorgang als JSON-Zeile geht (für Morphos nach dem Lauf). */
  journal?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

function said(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}
function refused(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

const DENIED = `Abgewiesen: Geschrieben wird nur unter src/ sowie in ${CONCEPT_FILE} und ${USERDOC_FILE} — und nur innerhalb des App-Ordners.`;

function str(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === 'string' ? value : null;
}

/** Zählt die Vorkommen — ohne Regex, damit Sonderzeichen nichts bedeuten. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count += 1;
  return count;
}

/**
 * Ein Server für EINEN Lauf: Er kennt den App-Ordner, führt Buch und beantwortet
 * die Nachrichten der CLI. Die Dateivorgänge geschehen unmittelbar auf der
 * Platte — der Ordner ist ein Git-Repository, die Historie fängt jeden Fehlgriff.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const root = options.root;
  const journal = options.journal ?? '';
  const run = emptyRunLog();

  /** Hält einen Vorgang fest — erst im Gedächtnis, dann in der Protokolldatei. */
  function note(entry: { kind: 'write' | 'delete'; path: string } | { kind: 'ask'; question: string }): string | null {
    if (entry.kind === 'write' && !run.writes.includes(entry.path)) run.writes.push(entry.path);
    if (entry.kind === 'delete' && !run.deletions.includes(entry.path)) run.deletions.push(entry.path);
    if (entry.kind === 'ask') run.question = entry.question;
    if (!journal) return null;
    try {
      fs.appendFileSync(journal, `${JSON.stringify(entry)}\n`, 'utf8');
      return null;
    } catch (err) {
      // Ohne Protokoll wüsste Morphos nach dem Lauf nicht, was geschehen ist —
      // das darf nicht stillschweigend passieren.
      return `Der Vorgang ließ sich nicht protokollieren: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function write(args: Record<string, unknown>): ToolResult {
    const target = writableTarget(root, args.path);
    if (target === null) return refused(DENIED);
    const content = str(args, 'content');
    if (content === null) return refused('Abgewiesen: content fehlt — write ersetzt die Datei vollständig.');

    const rel = insidePath(root, target);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    } catch (err) {
      return refused(`Schreiben fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
    const failed = note({ kind: 'write', path: rel });
    return failed ? refused(failed) : said(`${rel} geschrieben (${content.length} Zeichen).`);
  }

  function edit(args: Record<string, unknown>): ToolResult {
    const target = writableTarget(root, args.path);
    if (target === null) return refused(DENIED);
    const oldText = str(args, 'old_text');
    const newText = str(args, 'new_text');
    if (oldText === null || newText === null) return refused('Abgewiesen: old_text und new_text werden beide gebraucht.');
    if (!oldText) return refused('Abgewiesen: old_text ist leer — mit write legst du eine Datei neu an.');

    const rel = insidePath(root, target);
    let before: string;
    try {
      before = fs.readFileSync(target, 'utf8');
    } catch {
      return refused(`Diese Datei gibt es (noch) nicht: ${rel}. Mit write legst du sie an.`);
    }

    const found = countOccurrences(before, oldText);
    if (found === 0) return refused(`In ${rel} kommt diese Stelle nicht vor. Lies die Datei und nimm den Text zeichengenau.`);
    if (found > 1 && args.replace_all !== true) {
      return refused(`In ${rel} kommt diese Stelle ${found}-mal vor. Nimm mehr Kontext dazu oder setze replace_all.`);
    }

    const after = args.replace_all === true ? before.split(oldText).join(newText) : before.replace(oldText, newText);
    try {
      fs.writeFileSync(target, after, 'utf8');
    } catch (err) {
      return refused(`Schreiben fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
    const failed = note({ kind: 'write', path: rel });
    return failed ? refused(failed) : said(`${rel} geändert (${found === 1 ? 'eine Stelle' : `${found} Stellen`}).`);
  }

  function remove(args: Record<string, unknown>): ToolResult {
    const target = writableTarget(root, args.path);
    // Gelöscht werden dürfen nur Quelldateien — die beiden Dokumente gehören zur
    // App und verschwinden nie (core/docs).
    if (target === null || !isValidSourcePath(insidePath(root, target))) {
      return refused('Abgewiesen: Gelöscht werden nur Quelldateien unter src/.');
    }

    const rel = insidePath(root, target);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(target);
    } catch {
      return refused(`Diese Datei gibt es nicht: ${rel}.`);
    }
    if (stat.isDirectory()) return refused(`${rel} ist ein Ordner — gelöscht werden einzelne Dateien.`);

    try {
      fs.rmSync(target, { force: true });
    } catch (err) {
      return refused(`Löschen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
    const failed = note({ kind: 'delete', path: rel });
    return failed ? refused(failed) : said(`${rel} gelöscht.`);
  }

  function ask(args: Record<string, unknown>): ToolResult {
    const question = (str(args, 'question') ?? '').trim();
    if (!question) return refused('Abgewiesen: Die Rückfrage braucht einen Text.');
    if (run.question !== null) return refused('Es ist schon eine Rückfrage gestellt. Beende den Lauf; der Anwender antwortet im Chat.');

    const failed = note({ kind: 'ask', question });
    return failed
      ? refused(failed)
      : said('Die Rückfrage ist notiert und wird dem Anwender gestellt. Beende jetzt den Lauf, ohne weitere Änderungen.');
  }

  function callTool(params: unknown): ToolResult {
    const p = isRecord(params) ? params : {};
    const name = typeof p.name === 'string' ? p.name : '';
    const args = isRecord(p.arguments) ? p.arguments : {};
    switch (name) {
      case 'write':
        return write(args);
      case 'edit':
        return edit(args);
      case 'delete':
        return remove(args);
      case 'ask':
        return ask(args);
      default:
        return refused(`Unbekanntes Werkzeug: ${name || '(ohne Namen)'}.`);
    }
  }

  function initialize(params: unknown): unknown {
    const wanted = isRecord(params) && typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    return {
      protocolVersion: KNOWN_PROTOCOL_VERSIONS.includes(wanted) ? wanted : MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    };
  }

  return {
    handle(message: unknown): JsonRpcResponse | null {
      if (!isRecord(message) || typeof message.method !== 'string') return null;
      const id = (message.id ?? null) as JsonRpcId;
      // Ohne Id ist es eine Benachrichtigung — darauf wird nicht geantwortet.
      const notification = message.id === undefined || message.id === null;

      let result: unknown;
      switch (message.method) {
        case 'initialize':
          result = initialize(message.params);
          break;
        case 'tools/list':
          result = { tools: MCP_TOOLS };
          break;
        case 'tools/call':
          result = callTool(message.params);
          break;
        case 'ping':
          result = {};
          break;
        default:
          if (notification) return null;
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unbekannte Methode: ${message.method}` } };
      }
      return notification ? null : { jsonrpc: '2.0', id, result };
    },

    log: () => ({ writes: [...run.writes], deletions: [...run.deletions], question: run.question }),
  };
}

/* ------------------------------------------------------------------ *
 * stdio: Nachrichten kommen zeilenweise, Antworten gehen zeilenweise
 * ------------------------------------------------------------------ */

export interface McpStdio {
  /** Nimmt ein Stück stdin (Zeilengrenzen dürfen mitten hindurch gehen) und liefert die Antwortzeilen. */
  push(chunk: string): string[];
}

export function createMcpStdio(server: McpServer): McpStdio {
  let buffer = '';
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      const out: string[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch (err) {
          out.push(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: `Unlesbares JSON: ${err instanceof Error ? err.message : String(err)}` },
            }),
          );
          continue;
        }
        const response = server.handle(message);
        if (response) out.push(JSON.stringify(response));
      }
      return out;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Der Anschluss an die Claude CLI
 * ------------------------------------------------------------------ */

/** Wie der Server zu starten ist — Morphos füllt das mit seinem eigenen Programm. */
export interface McpLaunch {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Die gebaute Hülle des Servers, wie sie neben dem Hauptprozess liegt
 * (dist-electron/mcp-server.js — siehe vite.config.ts).
 */
export const MCP_SERVER_FILE = 'mcp-server.js';

/**
 * Wie Morphos seinen eigenen Server startet: mit dem eigenen Programm, das dank
 * `ELECTRON_RUN_AS_NODE` als schlichtes Node läuft. So braucht der Anwender kein
 * installiertes Node — was Morphos starten kann, kann es auch als Server starten.
 *
 * `root` ist der App-Ordner (die Grenze), `journal` die Datei, aus der Morphos
 * nach dem Lauf abliest, was geschehen ist.
 */
export function mcpLaunch(options: { execPath: string; server: string; root: string; journal?: string }): McpLaunch {
  return {
    command: options.execPath,
    args: [options.server],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      [MCP_ROOT_ENV]: options.root,
      ...(options.journal ? { [MCP_JOURNAL_ENV]: options.journal } : {}),
    },
  };
}

/** Die `--mcp-config`-Nutzlast: genau ein Server, unserer. */
export function mcpConfigJson(launch: McpLaunch): string {
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'stdio',
        command: launch.command,
        args: launch.args,
        ...(launch.env ? { env: launch.env } : {}),
      },
    },
  });
}

/**
 * Die Aufrufteile für die Claude CLI: unser Server, streng (keine Server aus der
 * Einrichtung des Anwenders), eine Freigabe, die nur Lesen und unsere eigenen
 * Werkzeuge kennt — und ein ausdrückliches Verbot der schreibenden Werkzeuge der
 * CLI.
 */
export function agentMcpArgs(launch: McpLaunch): string[] {
  return [
    '--mcp-config', mcpConfigJson(launch),
    '--strict-mcp-config',
    ...MCP_ALLOWED_TOOLS.flatMap((tool) => ['--allowedTools', tool]),
    ...MCP_DENIED_TOOLS.flatMap((tool) => ['--disallowedTools', tool]),
  ];
}
