import { spawn } from 'node:child_process';
import { findOnPath } from './which';

/**
 * Ein Terminal in einem Ordner öffnen (c0075) — das Gegenstück zum
 * Dateimanager, den Electron selbst aufmacht (`shell.openPath`). Läuft nur im
 * Hauptprozess.
 *
 * Jedes System hat sein eigenes Terminal, und auf Linux hat es jeder Anwender
 * anders: Darum eine Liste von Kandidaten, von der der erste genommen wird, den
 * es auf diesem Rechner gibt. Der Ordner geht als Arbeitsverzeichnis des
 * Kindprozesses mit (`cwd`) — die Option dafür heißt bei jedem Terminal anders,
 * das cwd bei keinem.
 */

export interface TerminalCommand {
  /** Das Programm — nach dem Nachsehen sein voller Pfad. */
  command: string;
  /** Seine Argumente; der Ordner selbst steckt im cwd (Ausnahme: macOS). */
  args: string[];
}

/** Die üblichen Terminals auf Linux/BSD, in der Reihenfolge des Nachsehens. */
const LINUX_TERMINALS = [
  'x-terminal-emulator', // die Wahl des Anwenders (Debian-Alternativen)
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'tilix',
  'alacritty',
  'kitty',
  'xterm',
];

/**
 * Womit sich auf diesem System ein Terminal öffnen lässt, bester Kandidat
 * zuerst. Auf macOS bekommt `open` den Ordner als Argument (es startet
 * Terminal.app, nicht das Terminal selbst — ein cwd hilft dort nicht).
 */
export function terminalCandidates(platform: string, dir: string): TerminalCommand[] {
  if (platform === 'darwin') return [{ command: 'open', args: ['-a', 'Terminal', dir] }];
  if (platform === 'win32') {
    return [
      { command: 'wt.exe', args: ['-d', dir] },
      // `start` löst sich sofort vom cmd, das es aufruft — das neue Fenster
      // erbt dessen Arbeitsverzeichnis, also unser cwd.
      { command: 'cmd.exe', args: ['/c', 'start', '', 'cmd.exe'] },
    ];
  }
  return LINUX_TERMINALS.map((command) => ({ command, args: [] }));
}

/**
 * Der erste Kandidat, den es auf diesem Rechner gibt (mit vollem Pfad), sonst
 * `null`. Auf Windows bleibt die Eingabeaufforderung als Rückfall stehen: Die
 * gibt es dort immer, auch wenn der PATH sie gerade nicht hergibt.
 */
export function pickTerminal(
  platform: string,
  dir: string,
  find: (names: string[]) => string | null = (names) => findOnPath(names),
): TerminalCommand | null {
  const candidates = terminalCandidates(platform, dir);
  for (const candidate of candidates) {
    const found = find([candidate.command]);
    if (found) return { command: found, args: candidate.args };
  }
  return platform === 'win32' ? candidates[candidates.length - 1] : null;
}

/**
 * Öffnet ein Terminal in diesem Ordner. Der Kindprozess wird abgekoppelt
 * (`detached`, `unref`) — das Terminal gehört danach dem Anwender und überlebt
 * Morphos; nichts von seiner Ausgabe kommt hierher zurück.
 */
export function openTerminal(dir: string, platform: string = process.platform): Promise<void> {
  const term = pickTerminal(platform, dir);
  if (!term) {
    const looked = terminalCandidates(platform, dir).map((c) => c.command).join(', ');
    return Promise.reject(new Error(`Kein Terminal gefunden (gesucht wurde nach: ${looked}).`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(term.command, term.args, { cwd: dir, detached: true, stdio: 'ignore' });
    child.once('error', (err: Error) => reject(err));
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
