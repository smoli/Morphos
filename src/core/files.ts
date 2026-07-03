import type { FileChanges, SourceFile } from '@/types';
import { extractHtml } from './html';

/**
 * Austauschformat zwischen Shell und LLM: Quelldateien als markierte Blöcke.
 *
 *   ===MORPHOS:FILE src/app.js===
 *   <Inhalt>
 *   ===MORPHOS:END===
 *   ===MORPHOS:DELETE src/alt.js===
 *
 * Das LLM gibt NUR geänderte/neue/gelöschte Dateien aus (inkrementell).
 */
export const FILE_MARKER = '===MORPHOS:';

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

/** Serialisiert einen Dateisatz für den LLM-Prompt (gleiches Blockformat). */
export function serializeFiles(files: SourceFile[]): string {
  return files
    .map((f) => `${FILE_MARKER}FILE ${f.path}===\n${f.content}\n${FILE_MARKER}END===`)
    .join('\n');
}

/**
 * Liest die LLM-Ausgabe: FILE-/DELETE-Blöcke, tolerant gegenüber erklärendem
 * Text oder Code-Fences drumherum. Ungültige Pfade werden verworfen.
 * Enthält die Ausgabe keine Blöcke, aber ein HTML-Dokument, wird dieses als
 * src/index.html gewertet (Rückfall auf das alte Ein-Dokument-Verhalten).
 */
export function parseLLMOutput(raw: string): FileChanges {
  const text = raw ?? '';
  const files: SourceFile[] = [];
  const deletions: string[] = [];

  const fileRe = /^===MORPHOS:FILE (.+?)===\r?\n([\s\S]*?)\r?\n?^===MORPHOS:END===/gm;
  for (let m = fileRe.exec(text); m; m = fileRe.exec(text)) {
    const path = m[1].trim();
    if (isValidSourcePath(path)) files.push({ path, content: m[2] });
  }

  const delRe = /^===MORPHOS:DELETE (.+?)===\s*$/gm;
  for (let m = delRe.exec(text); m; m = delRe.exec(text)) {
    const path = m[1].trim();
    if (isValidSourcePath(path)) deletions.push(path);
  }

  if (files.length === 0 && deletions.length === 0) {
    const html = extractHtml(text);
    if (html && /<html[\s>]/i.test(html)) {
      return { files: [{ path: 'src/index.html', content: html }], deletions: [] };
    }
  }

  return { files, deletions };
}

/** Wendet Änderungen auf einen Dateisatz an; liefert einen NEUEN, sortierten Satz. */
export function applyChanges(current: SourceFile[], changes: FileChanges): SourceFile[] {
  const byPath = new Map(current.map((f) => [f.path, f.content]));
  for (const f of changes.files) byPath.set(f.path, f.content);
  for (const p of changes.deletions) byPath.delete(p);
  return [...byPath.entries()]
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
