import type { AppDocs, DocChanges, SourceFile } from '@/types';

/**
 * Die beiden Dokumente, die jede App neben ihren Quellen führt — vom LLM
 * gepflegt, im Wurzelverzeichnis der App abgelegt und mitversioniert (ein
 * Revert holt also auch die Dokumente des alten Standes zurück):
 *
 *   concept.md            die lebende Spezifikation: Absicht, Aufbau und
 *                         Entscheidungen der App. Sie geht in JEDEN Prompt
 *                         zurück — das Gedächtnis der App über den Dialog hinaus.
 *   userdocumentation.md  die Anleitung für den Anwender.
 *
 * Sie sind KEINE Quelldateien: Sie liegen nicht unter src/, werden nicht in das
 * Artefakt gebündelt und sind das einzige, was das LLM außerhalb von src/
 * schreiben darf.
 */
export const CONCEPT_FILE = 'concept.md';
export const USERDOC_FILE = 'userdocumentation.md';

/** Noch keine Dokumente (neue App). */
export const EMPTY_DOCS: AppDocs = { concept: '', userdoc: '' };

/** Genau diese beiden Pfade darf das LLM außerhalb von src/ schreiben. */
export function isDocPath(p: string): boolean {
  return p === CONCEPT_FILE || p === USERDOC_FILE;
}

/**
 * Trennt die Dokumente aus einem vom LLM gelieferten Dateisatz heraus: die
 * Quelldateien wandern in die App, die Dokumente daneben.
 */
export function splitDocs(files: SourceFile[]): { sources: SourceFile[]; docs: DocChanges } {
  const sources: SourceFile[] = [];
  const docs: DocChanges = {};
  for (const f of files) {
    if (f.path === CONCEPT_FILE) docs.concept = f.content;
    else if (f.path === USERDOC_FILE) docs.userdoc = f.content;
    else sources.push(f);
  }
  return { sources, docs };
}

/** Hat das LLM überhaupt ein Dokument mitgeschickt? */
export function hasDocChanges(docs: DocChanges): boolean {
  return docs.concept !== undefined || docs.userdoc !== undefined;
}

/** Legt die gelieferten Dokumente auf den bisherigen Stand — Ungenanntes bleibt. */
export function applyDocs(current: AppDocs, changes: DocChanges): AppDocs {
  return {
    concept: changes.concept ?? current.concept,
    userdoc: changes.userdoc ?? current.userdoc,
  };
}

/** Nimmt (fremde) Eingaben als Dokumentenstand entgegen; Fehlendes bleibt leer. */
export function toDocs(value: unknown): AppDocs {
  const v = (value ?? {}) as Partial<AppDocs>;
  return {
    concept: typeof v.concept === 'string' ? v.concept : '',
    userdoc: typeof v.userdoc === 'string' ? v.userdoc : '',
  };
}
