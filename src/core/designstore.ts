import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_FILE, emptyDesign, normalizeDesign, type Design } from './design';

/**
 * Der UI-Entwurf auf der Platte (nur Hauptprozess):
 *
 *   <app>/design.ui.json   der Entwurf — im Wurzelverzeichnis der App, neben
 *                          concept.md, also NICHT unter src/
 *
 * Das Modell selbst steht in core/design und ist rein; hier liegt allein der
 * Griff zur Datei. Getrennt sind die beiden, weil der Renderer seit c0107 den
 * Baum selbst verändert (zeichnen, benennen) und dafür die Helfer aus
 * core/design als echte Werte lädt — node:fs darf dabei nicht mitkommen. Der
 * Renderer erreicht diese Datei nur über den Host (morphos:readDesign /
 * morphos:writeDesign).
 *
 * Geschrieben wird die Datei ausschließlich von der Schale: Für den Agenten ist
 * sie Nur-Lesen (core/files lässt ihn nur unter src/ und in die beiden
 * Dokumente schreiben).
 */

/** Wo der Entwurf einer App liegt. */
export function designPath(dir: string): string {
  return path.join(dir, DESIGN_FILE);
}

/**
 * Liest den Entwurf einer App. Fehlt die Datei oder ist sie beschädigt, kommt
 * ein leerer Entwurf zurück — ein fehlender Entwurf ist der Normalfall, kein
 * Fehler. Geschrieben wird dabei nichts.
 */
export function readDesign(dir: string): Design {
  try {
    return normalizeDesign(JSON.parse(fs.readFileSync(designPath(dir), 'utf8')));
  } catch {
    return emptyDesign();
  }
}

/**
 * Schreibt den Entwurf in den App-Ordner — eingerückt, damit er sich im Git-Diff
 * lesen lässt. Was hineingeht, wird zuvor zurechtgerückt: Auf der Platte steht
 * nie ein kaputter Baum. Zurück kommt genau der Baum, der geschrieben wurde —
 * damit das Fenster den Stand der Datei zeigt und nicht seinen eigenen.
 */
export function writeDesign(dir: string, design: Design): Design {
  const clean = normalizeDesign(design);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(designPath(dir), JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}
