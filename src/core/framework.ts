/**
 * Womit eine App ihre Oberfläche baut. Neue Apps entstehen standardmäßig mit
 * Preact + htm (eingebaute Bibliothek, siehe electron/main BUILTIN_LIB_FILES);
 * abwählbar ist das im Composer, aber nur beim Anlegen. Danach trägt die App
 * ihre Wahl in ihrem eigenen Quelltext — Folgewünsche bleiben in ihrem Stil,
 * ohne dass irgendwo etwas mitgeführt werden müsste.
 */
import type { Framework, SourceFile } from '@/types';
import { extractLibs } from './libs';
import { ENTRY_FILE } from './bundle';

/** Name der eingebauten Preact-Bibliothek (Inhalt des morphos:lib-Metatags). */
export const PREACT_LIB = 'preact';

/** Vorgabe für eine NEUE App: Preact ist an, bis der Anwender es abwählt. */
export const DEFAULT_FRAMEWORK: Framework = 'preact';

/**
 * Liest am Quelltext ab, womit eine bestehende App gebaut ist: Preact fordert
 * sie in src/index.html per <meta name="morphos:lib" content="preact"> an.
 */
export function detectFramework(files: SourceFile[]): Framework {
  const entry = files.find((f) => f.path === ENTRY_FILE);
  if (!entry) return 'vanilla';
  return extractLibs(entry.content).includes(PREACT_LIB) ? 'preact' : 'vanilla';
}

/**
 * Das für DIESE Generierung geltende Framework: Eine bestehende App bringt ihre
 * Wahl selbst mit, eine neue bekommt, was im Composer angehakt war. Ohne beides
 * bleibt es bei vanilla — die Vorgabe „an“ setzt die Oberfläche, nicht dieser
 * Pfad.
 */
export function resolveFramework(files: SourceFile[], requested?: Framework): Framework {
  if (files.length > 0) return detectFramework(files);
  return requested === 'preact' ? 'preact' : 'vanilla';
}
