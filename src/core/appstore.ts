import fs from 'node:fs';
import path from 'node:path';
import type { AppData, AppDocs, AppMeta, ChatMessage, LegacyHistoryEntry, SourceFile } from '@/types';
import { isValidSourcePath } from './files';
import { ENTRY_FILE } from './bundle';
import { commitAll, ensureRepo } from './gitstore';
import { CONCEPT_FILE, USERDOC_FILE } from './docs';
import { DEFAULT_ICON } from './app';
import { extractIcon } from './html';

/**
 * Ablage einer App auf der Platte (nur Hauptprozess):
 *   <app>/app.json                Manifest (Kopfdaten, ohne Historie)
 *   <app>/src/…                   Quelldateien
 *   <app>/index.html              gebündeltes Artefakt (eigenständig öffenbar)
 *   <app>/concept.md              lebende Spezifikation (geht in jeden Prompt)
 *   <app>/userdocumentation.md    Anleitung für den Anwender
 *   <app>/chat.json               Dialogverlauf (von Git ausgenommen — kein Revert)
 *   <app>/.git                    Versionshistorie (ein Commit je Generierung)
 *
 * Die beiden Dokumente sind mitversioniert (anders als chat.json): Ein Revert
 * holt den Stand der App samt der Dokumente zurück, die ihn beschreiben.
 */

type ManifestOnDisk = AppMeta & { history?: LegacyHistoryEntry[]; activeId?: string | null };

/** Liest das Manifest (app.json) — null, wenn keines vorhanden/lesbar. */
export function readManifest(dir: string): ManifestOnDisk | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8')) as ManifestOnDisk;
  } catch {
    return null;
  }
}

function writeManifest(dir: string, meta: AppMeta): void {
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(meta, null, 2), 'utf8');
}

/** Liest alle Quelldateien unter src/ (Pfade mit "/", sortiert). */
export function readSourceFiles(dir: string): SourceFile[] {
  const srcDir = path.join(dir, 'src');
  const files: SourceFile[] = [];
  const walk = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile()) {
        const rel = path.relative(dir, abs).split(path.sep).join('/');
        files.push({ path: rel, content: fs.readFileSync(abs, 'utf8') });
      }
    }
  };
  walk(srcDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Bringt src/ auf der Platte exakt auf den übergebenen Dateisatz (löscht Verwaistes). */
function syncSourceFiles(dir: string, files: SourceFile[]): void {
  for (const f of files) {
    if (!isValidSourcePath(f.path)) throw new Error(`Ungültiger Quelldatei-Pfad: ${f.path}`);
  }
  fs.rmSync(path.join(dir, 'src'), { recursive: true, force: true });
  for (const f of files) {
    const abs = path.join(dir, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content, 'utf8');
  }
}

/**
 * Der Dialogverlauf ist bewusst KEIN Teil der Versionierung: Ein Revert stellt
 * den App-Stand wieder her, spult aber das Gespräch nicht zurück.
 */
function ensureGitignore(dir: string): void {
  const file = path.join(dir, '.gitignore');
  let current = '';
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    /* noch keine .gitignore */
  }
  if (!current.split(/\r?\n/).includes('/chat.json')) {
    fs.writeFileSync(file, current ? `${current.replace(/\n?$/, '\n')}/chat.json\n` : '/chat.json\n', 'utf8');
  }
}

/** Liest den Dialogverlauf (chat.json) — leer, wenn keiner vorhanden/lesbar. */
export function readChat(dir: string): ChatMessage[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'chat.json'), 'utf8')) as { messages?: ChatMessage[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

/** Schreibt den Dialogverlauf (chat.json). */
export function writeChat(dir: string, chat: ChatMessage[]): void {
  fs.mkdirSync(dir, { recursive: true });
  ensureGitignore(dir);
  fs.writeFileSync(path.join(dir, 'chat.json'), JSON.stringify({ messages: chat }, null, 2), 'utf8');
}

/** Liest die beiden Dokumente der App (leer, wo noch keines vorhanden ist). */
export function readDocs(dir: string): AppDocs {
  const read = (name: string): string => {
    try {
      return fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      return '';
    }
  };
  return { concept: read(CONCEPT_FILE), userdoc: read(USERDOC_FILE) };
}

/**
 * Schreibt die Dokumente in den App-Ordner. Ein leeres Dokument wird NICHT
 * angelegt — solange das LLM keines geliefert hat, gibt es auch keine Datei.
 */
export function writeDocs(dir: string, docs: AppDocs): void {
  fs.mkdirSync(dir, { recursive: true });
  if (docs.concept) fs.writeFileSync(path.join(dir, CONCEPT_FILE), docs.concept, 'utf8');
  if (docs.userdoc) fs.writeFileSync(path.join(dir, USERDOC_FILE), docs.userdoc, 'utf8');
}

/**
 * Schreibt den kompletten App-Stand (Manifest, Quellen, Artefakt und — sofern
 * übergeben — die beiden Dokumente) — ohne Commit.
 */
export function writeAppState(
  dir: string,
  meta: AppMeta,
  files: SourceFile[],
  html: string,
  docs?: AppDocs,
): void {
  fs.mkdirSync(dir, { recursive: true });
  ensureGitignore(dir);
  syncSourceFiles(dir, files);
  writeManifest(dir, meta);
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  if (docs) writeDocs(dir, docs);
}

/**
 * Schreibt, was NACH einem Agentenlauf noch dazugehört: Manifest und gebündeltes
 * Artefakt. Die Quellen und die beiden Dokumente stehen da bereits — der Agent
 * hat sie selbst geschrieben (c0087), die Platte ist die maßgebliche Quelle.
 */
export function writeAppArtifact(dir: string, meta: AppMeta, html: string): void {
  fs.mkdirSync(dir, { recursive: true });
  ensureGitignore(dir);
  writeManifest(dir, meta);
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

/** Aktualisiert den updatedAt-Zeitstempel im Manifest (z. B. nach einem Revert). */
export function touchManifest(dir: string, updatedAt: number): void {
  const meta = readManifest(dir);
  if (!meta) return;
  writeManifest(dir, {
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    ...(meta.iconCustom ? { iconCustom: true } : {}),
    createdAt: meta.createdAt,
    updatedAt,
  });
}

/**
 * Das Vorgabe-Icon einer App: das Emoji, das das LLM im gebündelten Artefakt
 * hinterlegt hat. Grundlage des Zurücksetzens einer eigenen Wahl.
 */
export function defaultIconOf(dir: string): string {
  try {
    return extractIcon(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')) || DEFAULT_ICON;
  } catch {
    return DEFAULT_ICON;
  }
}

/**
 * Setzt das Icon im Manifest, ohne die App zu laden — `null` stellt die Vorgabe
 * des LLM wieder her. Liefert das nun wirksame Icon. Der Zeitstempel bleibt
 * unangetastet: Ein neues Icon ist keine inhaltliche Änderung und soll die
 * Reihenfolge der Kacheln nicht durcheinanderbringen.
 */
export function setManifestIcon(dir: string, icon: string | null): string {
  const meta = readManifest(dir);
  if (!meta) throw new Error('Diese App hat kein Manifest (app.json).');
  const effective = icon ?? defaultIconOf(dir);
  writeManifest(dir, {
    id: meta.id,
    name: meta.name,
    icon: effective,
    ...(icon === null ? {} : { iconCustom: true }),
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  });
  return effective;
}

/**
 * Migration einer App aus dem Alt-Format (Versionshistorie als JSON) zu Git:
 * Jede alte Version wird mit Original-Wunsch und -Zeitstempel als Commit
 * nachgespielt; war eine ältere Version aktiv, folgt ein Wiederherstell-Commit.
 */
async function migrateLegacyApp(dir: string, legacy: ManifestOnDisk): Promise<void> {
  const history = legacy.history ?? [];
  const meta: AppMeta = {
    id: legacy.id,
    name: legacy.name,
    icon: legacy.icon,
    ...(legacy.iconCustom ? { iconCustom: true } : {}),
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };

  const alreadyRepo = fs.existsSync(path.join(dir, '.git'));
  await ensureRepo(dir);

  if (!alreadyRepo) {
    for (const entry of history) {
      writeAppState(dir, { ...meta, updatedAt: entry.time }, [{ path: ENTRY_FILE, content: entry.html }], entry.html);
      await commitAll(dir, entry.prompt, entry.time);
    }
    const last = history[history.length - 1];
    const active = legacy.activeId ? history.find((h) => h.id === legacy.activeId) : undefined;
    if (active && last && active.id !== last.id) {
      writeAppState(dir, { ...meta, updatedAt: last.time }, [{ path: ENTRY_FILE, content: active.html }], active.html);
      await commitAll(dir, `Zurück zu: ${active.prompt}`);
    }
  } else {
    // Ein früherer Migrationslauf wurde unterbrochen: nur noch das Manifest bereinigen.
    writeManifest(dir, meta);
    await commitAll(dir, 'Umstellung auf Git-Versionierung abgeschlossen');
  }
}

/** Lädt eine App von der Platte (nach etwaiger Migration des Alt-Formats). */
export async function loadAppFromDisk(dir: string): Promise<AppData | null> {
  const manifest = readManifest(dir);
  if (!manifest) return null;

  if (Array.isArray(manifest.history)) {
    await migrateLegacyApp(dir, manifest);
  }

  const meta = readManifest(dir);
  if (!meta) return null;
  let html = '';
  try {
    html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  } catch {
    /* Artefakt fehlt — bleibt leer */
  }
  return {
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    iconCustom: meta.iconCustom === true,
    createdAt: meta.createdAt ?? 0,
    updatedAt: meta.updatedAt ?? 0,
    files: readSourceFiles(dir),
    html,
    chat: readChat(dir),
    docs: readDocs(dir),
  };
}
