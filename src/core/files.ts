import { isDocPath } from './docs';

/**
 * Welche Pfade zu einer App gehören dürfen.
 *
 * Der Agent schreibt unmittelbar auf der Platte (c0087) — durch den MCP-Server
 * von Morphos hindurch, der jeden Pfad hier prüft (core/mcp: writablePath).
 * Dieselbe Prüfung gilt für alles, was sonst in einen App-Ordner geschrieben
 * wird (core/appstore).
 */

/**
 * Gültige Quelldatei-Pfade: unter src/, "/"-getrennt, nur einfache Zeichen,
 * kein Traversal, keine leeren Segmente. Schützt vor Ausbruch aus dem
 * App-Ordner und vor Überschreiben von app.json/.git.
 */
export function isValidSourcePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 200) return false;
  if (!/^src\/[A-Za-z0-9._/-]+$/.test(p)) return false;
  const segments = p.split('/');
  if (segments.length > 8) return false;
  return segments.every((s) => s.length > 0 && s !== '.' && s !== '..');
}

/**
 * Was das LLM überhaupt schreiben darf: Quelldateien unter src/ — und daneben
 * GENAU die beiden Dokumente der App im Wurzelverzeichnis (core/docs). Jeder
 * andere Pfad außerhalb von src/ bleibt ausgeschlossen.
 */
export function isValidOutputPath(p: string): boolean {
  return isValidSourcePath(p) || isDocPath(p);
}
