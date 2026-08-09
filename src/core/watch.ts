/**
 * Mitlaufende Beobachtung von Ordnern im Datenordner — die Grundlage dafür,
 * dass der Datei-Explorer eine Änderung sofort zeigt, statt sie zu verpassen.
 *
 * Beobachtet wird ausschließlich HIER, im Hauptprozess (siehe electron/main:
 * morphos:watch): Der Renderer bekommt nur ein „hier hat sich etwas getan“ und
 * liest den Ordner daraufhin über den gewohnten, eingegrenzten Weg neu. Jeder
 * Pfad läuft durch `confineWithin` — über den Datenordner hinaus wird nichts
 * beobachtet. (Der Symlink-Schutz greift beim anschließenden Lesen in
 * core/fsaccess; ein Ereignis allein verrät keinen Inhalt.)
 *
 * Ereignisse kommen in Schwällen — ein einziges Speichern löst gern mehrere
 * aus. Sie werden deshalb gebündelt: Erst wenn für `debounceMs` Ruhe ist, geht
 * genau eine Meldung raus.
 */

import fs from 'node:fs';
import { confineWithin } from './fsaccess';

/** Ruhezeit, nach der ein Schwall von Ereignissen als eine Änderung gilt. */
export const WATCH_DEBOUNCE_MS = 150;

/** Ein laufender Beobachter, wie ihn `fs.watch` liefert. */
export interface WatchHandle {
  close(): void;
}

/** Erzeugt den eigentlichen Beobachter — in Tests durch eine Attrappe ersetzbar. */
export type WatchFactory = (absPath: string, onEvent: () => void) => WatchHandle;

/** Der Ernstfall: ein Ordner-Beobachter des Betriebssystems. */
const nodeWatch: WatchFactory = (absPath, onEvent) => {
  const watcher = fs.watch(absPath, { persistent: false }, () => onEvent());
  // Verschwindet der Ordner unter dem Beobachter, ist das kein Grund für einen
  // Absturz des Hauptprozesses — die nächste Liste zeigt es ohnehin.
  watcher.on('error', () => watcher.close());
  return { close: () => watcher.close() };
};

interface Entry {
  owner: number;
  handle: WatchHandle;
  notify?: (id: string) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Die Buchführung über alle laufenden Beobachter. Jeder gehört einem Fenster
 * (`owner` = die Id seiner webContents): Schließt es, gehen mit `stopAll` auch
 * seine Beobachter — kein Beobachter überlebt sein Fenster.
 */
export class FolderWatchers {
  private readonly debounceMs: number;
  private readonly factory: WatchFactory;
  private readonly entries = new Map<string, Entry>();
  private seq = 0;

  constructor(opts: { debounceMs?: number; factory?: WatchFactory } = {}) {
    this.debounceMs = opts.debounceMs ?? WATCH_DEBOUNCE_MS;
    this.factory = opts.factory ?? nodeWatch;
  }

  /** Wie viele Beobachter gerade laufen. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Beginnt, einen Ordner zu beobachten, und liefert dessen Kennung. `relPath`
   * ist relativ zum Datenordner `root`; bricht er daraus aus, wird nichts
   * beobachtet und null geliefert. Lässt sich der Ordner nicht beobachten (er
   * existiert etwa gar nicht), wirft der Aufruf.
   */
  start(owner: number, root: string, relPath: string, notify?: (id: string) => void): string | null {
    const target = confineWithin(root, relPath);
    if (target === null) return null;

    const id = `w${++this.seq}`;
    const handle = this.factory(target, () => this.onEvent(id));
    this.entries.set(id, { owner, handle, notify, timer: null });
    return id;
  }

  /** Beendet einen Beobachter; false, wenn es ihn nicht (mehr) gibt. */
  stop(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (entry.timer) clearTimeout(entry.timer);
    entry.handle.close();
    this.entries.delete(id);
    return true;
  }

  /** Beendet alle Beobachter eines Fensters und liefert deren Anzahl. */
  stopAll(owner: number): number {
    let stopped = 0;
    for (const [id, entry] of [...this.entries]) {
      if (entry.owner !== owner) continue;
      this.stop(id);
      stopped++;
    }
    return stopped;
  }

  /** Ein Ereignis des Betriebssystems: melden, sobald der Schwall abebbt. */
  private onEvent(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      // Zwischenzeitlich beendet? Dann geht keine Meldung mehr raus.
      if (this.entries.get(id) !== entry) return;
      entry.notify?.(id);
    }, this.debounceMs);
    entry.timer.unref?.();
  }
}
