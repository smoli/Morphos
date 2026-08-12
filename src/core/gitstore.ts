import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { COMMON_PLACES, findOnPath } from './which';
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

/**
 * Was git davon abhält, nach Zugangsdaten zu FRAGEN. Geklont wird mit der
 * Git-Einrichtung des Anwenders (Credential-Helfer, SSH-Schlüssel, Agent) — nur
 * eine Eingabeaufforderung darf es nicht geben: Im Hauptprozess hängt sie an
 * einem Terminal, das niemand sieht, und der Klon käme nie zum Ende. Ohne
 * hinterlegten Zugang scheitert er stattdessen sofort mit einer Meldung.
 */
const NON_INTERACTIVE = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -oBatchMode=yes',
};

/**
 * Der Zugang zur Gegenstelle bleibt Sache des Anwenders — mit einer Ausnahme,
 * die sonst wie ein Fehler aussieht (i0007): Wer sich mit der GitHub-CLI
 * angemeldet hat (`gh auth login`), hält sein Token in gh; in der
 * Git-Konfiguration steht deshalb noch nichts davon (das täte erst
 * `gh auth setup-git`). git fragte also seine üblichen Helfer, bekam nichts,
 * wollte nachfragen — und scheiterte an der abgeschalteten Eingabeaufforderung.
 * Für den Anwender: „Ich bin doch angemeldet."
 *
 * Also hängt Morphos für http(s)-Adressen gh als ZUSÄTZLICHEN Helfer an die
 * Kette. Über `-c` steht er in der Rangfolge hinter allem Konfigurierten: Die
 * eigenen Helfer des Anwenders werden zuerst gefragt, gh nur, wenn keiner
 * geantwortet hat. Das Token bleibt dabei bei gh — Morphos sieht es nie und
 * speichert nichts. Kennt gh die Gegenstelle nicht (gitlab.com…), schweigt der
 * Helfer und git macht weiter wie ohne ihn.
 */
const GH_CREDENTIAL = 'auth git-credential';

/** Die Gegenstelle einer http(s)-Adresse (`https://github.com`), sonst leer. */
const HTTP_URL = /^(https?):\/\/(?:[^/@\s]*@)?([A-Za-z0-9._-]+(?::\d+)?)(?:[/?#]|$)/i;

/** Steuerzeichen — was davon im Pfad steckt, geht git nichts an. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]');

/**
 * Die `-c`-Argumente, die gh als Credential-Helfer für die Gegenstelle DIESER
 * Adresse eintragen — leer, wenn es nichts einzutragen gibt: ohne gh, bei
 * ssh-, git- und Datei-Adressen (dort fragt niemand nach einem Passwort).
 */
export function ghCredentialArgs(url: string, ghPath: string | null): string[] {
  if (!ghPath || CONTROL_CHARS.test(ghPath)) return [];
  const match = HTTP_URL.exec(url.trim());
  if (!match) return [];
  const [, scheme, host] = match;
  const quoted = `'${ghPath.replace(/'/g, `'\\''`)}'`;
  return ['-c', `credential.${scheme.toLowerCase()}://${host.toLowerCase()}.helper=!${quoted} ${GH_CREDENTIAL}`];
}

/**
 * Der Pfad zur GitHub-CLI (siehe core/which: PATH, sonst die üblichen Plätze).
 * `null`, wenn es sie nicht gibt; dann bleibt alles wie bisher.
 */
export function findGh(env: NodeJS.ProcessEnv = process.env, places: string[] = COMMON_PLACES): string | null {
  return findOnPath(process.platform === 'win32' ? ['gh.exe', 'gh.cmd'] : ['gh'], env, places);
}

/**
 * Holt ein Repository in einen NEUEN Ordner — ein echter Klon: mit `.git`,
 * voller Historie und `origin`. Fehlende Elternordner entstehen dabei; der
 * Zielordner selbst darf noch nicht existieren (git besteht darauf).
 *
 * Die Adresse kommt vom Anwender und geht als eigenes Argument hinter `--` an
 * git — sie kann keine Option werden. Geprüft wird sie zuvor in core/appimport.
 */
export async function cloneRepo(url: string, targetDir: string): Promise<void> {
  const parent = path.dirname(targetDir);
  fs.mkdirSync(parent, { recursive: true });
  const args = [...ghCredentialArgs(url, findGh()), 'clone', '--quiet', '--', url, targetDir];
  await runGit(parent, args, NON_INTERACTIVE);
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
