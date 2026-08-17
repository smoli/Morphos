import fs from 'node:fs';
import path from 'node:path';
import type { AgentResult, AppMeta, AppSnapshot, GenerateResult } from '@/types';
import { agentMcpArgs, mcpLaunch, parseRunLog, wroteSomething, type McpRunLog } from './mcp';
import { buildPrompt, type PromptContext } from './prompt';
import { readDocs, readManifest, readSourceFiles, writeAppArtifact } from './appstore';
import { bundle, ENTRY_FILE } from './bundle';
import { extractHtml, extractIcon, extractTitle } from './html';
import { extractLibs, splitLibs } from './libs';
import { resolveFramework } from './framework';
import { readDesign } from './design';
import { DEFAULT_ICON, DEFAULT_NAME, makeAppId } from './app';

/**
 * Ein Agentenlauf auf dem Ordner der App (c0087).
 *
 * Der Agent bekommt keine Dateien mehr in den Prompt und gibt auch keine
 * zurück: Er arbeitet UNMITTELBAR auf der Platte, mit dem App-Ordner als
 * Arbeitsverzeichnis. Gelesen wird mit den eigenen Werkzeugen der Claude CLI,
 * geschrieben und gefragt allein über den MCP-Server, den Morphos für den Lauf
 * startet (core/mcp) — er ist die Grenze und führt zugleich Buch.
 *
 * Danach liest Morphos das Ergebnis von der Platte zurück, bündelt das Artefakt
 * und macht EINEN Commit mit dem Wunsch als Botschaft. Ein Lauf, der nichts
 * geschrieben hat, hinterlässt auch keinen Commit — er trägt nur die Mitteilung
 * bzw. die Rückfrage des Agenten zurück in den Chat.
 *
 * Alles, was hier geschieht, ist reine Ablauf-Logik: Womit der Agent gestartet
 * wird, wie Bibliotheken beschafft und wie committet wird, kommt von außen
 * (GenerateDeps) — deshalb lässt sich der ganze Weg ohne echten Agenten prüfen.
 */

/** Was der Lauf von der Schale braucht (Hauptprozess: siehe electron/main). */
export interface GenerateDeps {
  /** Startet die Claude CLI mit dem App-Ordner als Arbeitsverzeichnis. */
  runAgent(options: { prompt: string; cwd: string; args: string[] }): Promise<AgentResult>;
  /** Beschafft externe Bibliotheken (Freigabeliste + Cache). */
  resolveLibs(urls: string[]): Promise<{ ok: true; libs: Record<string, string> } | { ok: false; error: string }>;
  /** Liefert eine eingebaute Bibliothek (liegt der Shell bei) — null, wenn unbekannt. */
  builtinLib(name: string): string | null;
  /** Macht aus dem App-Ordner ein Git-Repository (falls er noch keines ist). */
  ensureRepo(dir: string): Promise<void>;
  /** Nimmt den Stand des Ordners als Commit auf. */
  commitAll(dir: string, message: string): Promise<void>;
  now(): number;
}

/** Der Auftrag: welche App, welcher Wunsch, welcher Kontext. */
export interface GenerateRequest {
  /** Das Arbeitsverzeichnis, in dem die App-Ordner liegen. */
  folder: string;
  /** Die App — null für einen Entwurf, der mit diesem Lauf erst entsteht. */
  id: string | null;
  /** Der Wunsch des Anwenders: Kern des Prompts und Botschaft des Commits. */
  wish: string;
  context?: PromptContext;
  libWhitelist?: string[];
  /** Das Programm, mit dem der MCP-Server startet (Morphos selbst). */
  execPath: string;
  /** Die gebaute Hülle des MCP-Servers (dist-electron/mcp-server.js). */
  server: string;
  /**
   * Die Protokolldatei des MCP-Servers. Sie liegt AUSSERHALB des App-Ordners —
   * sonst landete sie im Commit.
   */
  journal: string;
}

/**
 * Die Aufrufteile für die Claude CLI: unser MCP-Server (streng), die Freigabe
 * nur für dessen Werkzeuge und das Lesen — und ausdrücklich KEIN Write/Edit/Bash
 * der CLI. Für ein mitgeschicktes Bild kommt genau dessen Ordner dazu; er liegt
 * außerhalb des Arbeitsverzeichnisses und wäre sonst unlesbar.
 */
export function agentArgs(options: {
  execPath: string;
  server: string;
  root: string;
  journal: string;
  images?: string[];
}): string[] {
  const launch = mcpLaunch({
    execPath: options.execPath,
    server: options.server,
    root: options.root,
    journal: options.journal,
  });
  const args = agentMcpArgs(launch);
  for (const image of options.images ?? []) {
    args.push('--add-dir', path.dirname(image), '--allowedTools', `Read(${image})`);
  }
  return args;
}

/** Liest das Lauf-Protokoll des MCP-Servers; ohne Datei hat der Lauf nichts getan. */
function readRunLog(journal: string): McpRunLog {
  try {
    return parseRunLog(fs.readFileSync(journal, 'utf8'));
  } catch {
    return parseRunLog('');
  }
}

/** Ein Entwurfsordner, der nichts hinterlassen hat, verschwindet wieder. */
function discardDraft(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Ein liegen gebliebener Ordner ohne app.json ist keine App und stört niemanden. */
  }
}

/**
 * Gibt dem Entwurfsordner den Namen, den die App sich selbst gegeben hat.
 * Scheitert das Umbenennen (unter Windows hält ein eben beendeter Kindprozess
 * den Ordner mitunter noch kurz), bleibt es beim Entwurfsnamen — er ist eine
 * gültige Id und die App ist vollständig. Zurück kommt der gültige Ordner.
 */
function renameDraft(folder: string, dir: string, name: string): string {
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = path.join(folder, makeAppId(name));
    if (fs.existsSync(target)) continue;
    try {
      fs.renameSync(dir, target);
      return target;
    } catch {
      /* nächster Versuch */
    }
  }
  return dir;
}

/** Die Kopfdaten des neuen Standes: eine neue App bekommt sie aus ihrem Artefakt. */
function nextMeta(dir: string, id: string, html: string, now: number): AppMeta {
  const meta = readManifest(dir);
  if (!meta) {
    return {
      id,
      name: extractTitle(html) || DEFAULT_NAME,
      icon: extractIcon(html) || DEFAULT_ICON,
      createdAt: now,
      updatedAt: now,
    };
  }
  // Eine bestehende App behält ihren Namen und ihr Icon — der Anwender hat sie
  // vor Augen, und ein neuer Titel im Artefakt soll sie ihm nicht wegziehen.
  return {
    id,
    name: meta.name,
    icon: meta.icon,
    ...(meta.iconCustom ? { iconCustom: true } : {}),
    createdAt: meta.createdAt ?? now,
    updatedAt: now,
  };
}

/** Bündelt den Dateisatz zum eigenständigen Artefakt (mit allen Bibliotheken). */
async function bundleApp(
  files: { path: string; content: string }[],
  deps: GenerateDeps,
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const entry = files.find((f) => f.path === ENTRY_FILE);
  if (!entry || !extractHtml(entry.content)) {
    return { ok: false, error: 'Die App hat kein gültiges src/index.html. Bitte den Wunsch anders formulieren.' };
  }

  // Eingebaute Bibliotheken (Preact) vor der Freigabeliste abfangen; der Rest
  // läuft über die freigegebenen Quellen.
  const { builtin, external } = splitLibs(extractLibs(entry.content));
  const libs: Record<string, string> = {};
  for (const name of builtin) {
    const src = deps.builtinLib(name);
    if (!src) return { ok: false, error: `Eingebaute Bibliothek nicht verfügbar: ${name}` };
    libs[name] = src;
  }
  const external_ = await deps.resolveLibs(external);
  if (!external_.ok) return external_;
  Object.assign(libs, external_.libs);

  const html = bundle(files, libs);
  if (!html) return { ok: false, error: 'Das Bündeln der App ist fehlgeschlagen.' };
  return { ok: true, html };
}

/**
 * Führt einen Wunsch aus: Ordner bereitstellen, Agenten darin arbeiten lassen,
 * das Ergebnis von der Platte übernehmen.
 */
export async function generateApp(req: GenerateRequest, deps: GenerateDeps): Promise<GenerateResult> {
  const draft = req.id === null;
  // Ein Entwurf braucht schon vor dem Lauf einen Ordner — der Agent arbeitet
  // darin. Wie die App am Ende heißt, weiß erst ihr Artefakt (siehe renameDraft).
  let dir = path.join(req.folder, req.id ?? makeAppId(DEFAULT_NAME));

  fs.mkdirSync(dir, { recursive: true });
  await deps.ensureRepo(dir);
  // Ein Protokoll vom letzten Mal würde diesem Lauf zugeschlagen.
  fs.rmSync(req.journal, { force: true });

  try {
    const before = readSourceFiles(dir);
    const context: PromptContext = {
      ...req.context,
      hasApp: before.length > 0,
      framework: resolveFramework(before, req.context?.framework),
      // Der Entwurf kommt von der Platte, nicht aus dem Kontext des Aufrufers:
      // Er liegt im App-Ordner (design.ui.json) und ist damit hier zu Hause.
      design: readDesign(dir),
    };
    const images = (req.context?.attachments ?? [])
      .filter((a) => a.kind === 'image' && a.path)
      .map((a) => a.path as string);

    const res = await deps.runAgent({
      prompt: buildPrompt(req.wish, req.libWhitelist ?? [], context),
      cwd: dir,
      args: agentArgs({
        execPath: req.execPath,
        server: req.server,
        root: dir,
        journal: req.journal,
        images,
      }),
    });

    const log = readRunLog(req.journal);
    if (!res.ok) {
      if (draft) discardDraft(dir);
      return res;
    }

    const say = res.text.trim();
    const question = log.question ?? '';

    // Nichts geschrieben: kein Commit. Der Lauf war eine Rückfrage oder eine
    // Mitteilung — beides gehört in den Chat, sonst nichts.
    if (!wroteSomething(log)) {
      if (draft) discardDraft(dir);
      return { ok: true, ...(say ? { say } : {}), ...(question ? { question } : {}) };
    }

    const files = readSourceFiles(dir);
    const bundled = await bundleApp(files, deps);
    if (!bundled.ok) {
      // Bei einem Entwurf gibt es nichts zu retten (er hat keine Id, unter der
      // der Anwender ihn wiederfände). Eine bestehende App behält die Arbeit des
      // Agenten auf der Platte: Sie ist ein Git-Repository, der letzte Commit
      // liegt daneben, und der nächste Lauf setzt darauf auf.
      if (draft) discardDraft(dir);
      return bundled;
    }

    if (draft) dir = renameDraft(req.folder, dir, extractTitle(bundled.html) || DEFAULT_NAME);
    const meta = nextMeta(dir, path.basename(dir), bundled.html, deps.now());

    writeAppArtifact(dir, meta, bundled.html);
    await deps.commitAll(dir, req.wish || meta.name);

    const app: AppSnapshot = { ...meta, files, html: bundled.html, docs: readDocs(dir) };
    return { ok: true, app, ...(say ? { say } : {}), ...(question ? { question } : {}) };
  } finally {
    fs.rmSync(req.journal, { force: true });
  }
}
