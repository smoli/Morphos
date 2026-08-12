import fs from 'node:fs';
import path from 'node:path';

/**
 * Ein Programm im System finden — ohne Schale, also ohne `which`/`where`.
 * Gesucht wird zuerst im PATH, danach an den üblichen Plätzen: Ein aus dem
 * Dock (bzw. per Doppelklick) gestartetes Programm erbt den PATH der
 * Anmeldeschale nicht und sähe sonst fast nichts.
 *
 * Läuft nur im Hauptprozess (Dateisystem).
 */

/** Die üblichen Plätze für Programme, wenn der PATH nichts hergibt. */
export const COMMON_PLACES = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/opt/local/bin'];

/**
 * Der volle Pfad des ersten Programms aus `names`, das sich finden lässt —
 * `null`, wenn keines davon da ist. Mehrere Namen sind für dieselbe Sache
 * gedacht (`gh.exe`/`gh.cmd`), nicht für eine Rangfolge über Plätze hinweg:
 * Geprüft wird Platz für Platz, dort jeder Name.
 */
export function findOnPath(
  names: string[],
  env: NodeJS.ProcessEnv = process.env,
  places: string[] = COMMON_PLACES,
): string | null {
  const dirs = [...(env.PATH ?? '').split(path.delimiter).filter(Boolean), ...places];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* nicht da — nächster Platz */
      }
    }
  }
  return null;
}
