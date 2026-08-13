import type { AppDocs } from '@/types';

/**
 * Die beiden Dokumente, die jede App neben ihren Quellen führt — vom LLM
 * gepflegt, im Wurzelverzeichnis der App abgelegt und mitversioniert (ein
 * Revert holt also auch die Dokumente des alten Standes zurück):
 *
 *   concept.md            die lebende Spezifikation: Absicht, Aufbau und
 *                         Entscheidungen der App — das Gedächtnis der App über
 *                         den Dialog hinaus. Der Agent liest sie zu Beginn
 *                         jedes Laufs selbst von der Platte (c0087).
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

/** Nimmt (fremde) Eingaben als Dokumentenstand entgegen; Fehlendes bleibt leer. */
export function toDocs(value: unknown): AppDocs {
  const v = (value ?? {}) as Partial<AppDocs>;
  return {
    concept: typeof v.concept === 'string' ? v.concept : '',
    userdoc: typeof v.userdoc === 'string' ? v.userdoc : '',
  };
}
