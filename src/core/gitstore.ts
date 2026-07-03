import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { VersionInfo } from '@/types';

/**
 * Git-Versionierung je App: Jeder App-Ordner ist ein eigenes Repository.
 * Jede Generierung wird ein Commit (Botschaft = Wunsch des Anwenders);
 * das Zurückspringen erzeugt einen neuen Commit mit dem alten Stand —
 * die Historie bleibt linear und verlustfrei.
 *
 * Nutzt das System-Git als Subprozess (wie die Claude CLI). Läuft nur im
 * Hauptprozess. Identität wird je Aufruf mit -c gesetzt, ohne die
 * Git-Konfiguration des Anwenders anzufassen.
 */

const GIT_IDENTITY = ['-c', 'user.name=Morphos', '-c', 'user.email=morphos@localhost'];

function runGit(dir: string, args: string[], env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: dir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(err.code === 'ENOENT'
        ? 'Der Befehl "git" wurde nicht gefunden. Ist Git installiert und im PATH?'
        : err.message));
    });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `git ${args[0]} endete mit Code ${code}.`));
    });
  });
}

/** Initialisiert das Repository im Ordner, falls noch keines existiert. */
export async function ensureRepo(dir: string): Promise<void> {
  if (fs.existsSync(path.join(dir, '.git'))) return;
  await runGit(dir, ['init', '-q']);
}

/** Gibt es ausstehende Änderungen (Arbeitsverzeichnis ≠ letzter Commit)? */
async function hasChanges(dir: string): Promise<boolean> {
  const status = await runGit(dir, ['status', '--porcelain']);
  return status.trim().length > 0;
}

/**
 * Übernimmt ALLE Änderungen im Ordner als einen Commit. Ohne Änderungen
 * passiert nichts. `timeMs` setzt den Zeitstempel (für die Migration).
 */
export async function commitAll(dir: string, message: string, timeMs?: number): Promise<void> {
  await runGit(dir, ['add', '-A']);
  if (!(await hasChanges(dir))) return;
  const env = timeMs
    ? { GIT_AUTHOR_DATE: new Date(timeMs).toISOString(), GIT_COMMITTER_DATE: new Date(timeMs).toISOString() }
    : undefined;
  await runGit(dir, [...GIT_IDENTITY, 'commit', '-q', '-m', message || '(ohne Botschaft)'], env);
}

/** Die Versionshistorie, neueste zuerst. Leer, wenn (noch) kein Repository. */
export async function listVersions(dir: string): Promise<VersionInfo[]> {
  try {
    // %x1f trennt Felder, %x1e trennt Commits — robust gegen jede Botschaft.
    const out = await runGit(dir, ['log', '--format=%H%x1f%ct%x1f%B%x1e']);
    return out
      .split('\x1e')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [sha, ct, message] = chunk.split('\x1f');
        return { sha, time: Number(ct) * 1000, prompt: (message ?? '').trim() };
      });
  } catch {
    return [];
  }
}

/** Anzahl der Versionen (0 ohne Repository/Commits). */
export async function countVersions(dir: string): Promise<number> {
  try {
    const out = await runGit(dir, ['rev-list', '--count', 'HEAD']);
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Setzt Index UND Arbeitsverzeichnis exakt auf den Baum eines früheren Commits
 * — auch Dateien, die erst später hinzukamen, verschwinden. Committet NICHT.
 */
export async function restoreTree(dir: string, sha: string): Promise<void> {
  if (!/^[0-9a-f]{4,40}$/i.test(sha)) throw new Error(`Ungültige Version: ${sha}`);
  await runGit(dir, ['read-tree', '--reset', '-u', sha]);
}

/**
 * Stellt den Stand eines früheren Commits wieder her und übernimmt ihn als
 * NEUEN Commit (Botschaft z. B. „Zurück zu: …“) — linear und verlustfrei.
 */
export async function restoreVersion(dir: string, sha: string, message: string): Promise<void> {
  await restoreTree(dir, sha);
  await commitAll(dir, message);
}
