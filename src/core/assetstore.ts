import fs from 'node:fs';
import path from 'node:path';
import {
  ASSETS_DIR,
  assetMime,
  assetName,
  assetPath,
  isAssetPath,
  sanitizeAssetName,
  uniqueAssetName,
  type AssetFile,
  type AssetInfo,
} from './assets';
import { commitAll, ensureRepo } from './gitstore';

/**
 * Die Assets einer App auf der Platte (nur Hauptprozess):
 *
 *   <app>/assets/…   die Dateien selbst — im Wurzelverzeichnis der App,
 *                    außerhalb des src/-Abgleichs, von Git mitversioniert
 *
 * Das Modell steht in core/assets und ist rein; hier liegt allein der Griff zur
 * Platte — dieselbe Trennung wie bei core/design und core/designstore. Der
 * Renderer erreicht diese Dateien nur über den Host (morphos:listAssets,
 * readAsset, addAsset, removeAsset).
 *
 * Gelesen und geschrieben wird BINÄR: Ein Buffer geht ohne Umweg über eine
 * Zeichenkette auf die Platte und zurück. Das ist der ganze Unterschied zu den
 * Quelldateien — ein UTF-8-Umweg macht aus jedem Byte über 0x7F ein
 * Ersatzzeichen und damit aus jedem Bild Bruch.
 *
 * Die Bytes bleiben dabei nirgends liegen: `listAssets` liefert nur Auskünfte
 * (Name, Pfad, Typ, Größe), `readAsset` holt eine einzelne Datei auf Zuruf.
 * Eine App mit 40 MB Bildern hat davon nichts im Speicher.
 *
 * Hinzufügen und Entfernen sind je EIN Commit — Assets gehören zur App wie ihre
 * Quellen, ein Revert holt sie darum mit zurück.
 */

/** Wo die Assets einer App liegen. */
export function assetsDir(dir: string): string {
  return path.join(dir, ASSETS_DIR);
}

/**
 * Der Ort eines Assets auf der Platte — null, wenn der Pfad keiner ist, der im
 * Asset-Ordner stehen darf. Die Prüfung geschieht am NAMEN (core/assets), nicht
 * am zusammengesetzten Pfad: Was kein gültiger Asset-Name ist, wird nie zu
 * einem Dateizugriff, und aus dem Ordner führt damit kein Weg hinaus.
 */
function assetTarget(dir: string, pathOrName: string): string | null {
  const name = assetName(pathOrName);
  return name ? path.join(assetsDir(dir), name) : null;
}

/** Die Auskunft über eine Datei im Asset-Ordner. */
function infoOf(name: string, size: number): AssetInfo {
  return { name, path: assetPath(name), mime: assetMime(name), size };
}

/**
 * Die Assets einer App — nur die Auskünfte, nach Namen sortiert. Ohne
 * Asset-Ordner (der Normalfall) kommt eine leere Liste; angelegt wird dabei
 * nichts. Unterordner und Verstecktes bleiben außen vor: Was `sanitizeAssetName`
 * nicht hätte anlegen können, gilt hier auch nicht als Asset.
 */
export function listAssets(dir: string): AssetInfo[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(assetsDir(dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const assets: AssetInfo[] = [];
  for (const e of entries) {
    if (!e.isFile() || !assetName(e.name)) continue;
    try {
      assets.push(infoOf(e.name, fs.statSync(path.join(assetsDir(dir), e.name)).size));
    } catch {
      /* zwischenzeitlich verschwunden — dann eben nicht */
    }
  }
  return assets.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ein einzelnes Asset samt seinen Bytes — null, wenn es das nicht gibt oder der
 * Pfad keiner ist. Nimmt `assets/logo.png` ebenso wie den bloßen `logo.png`.
 */
export function readAsset(dir: string, pathOrName: string): AssetFile | null {
  const target = assetTarget(dir, pathOrName);
  if (!target) return null;
  try {
    const data = fs.readFileSync(target);
    return { ...infoOf(path.basename(target), data.length), data };
  } catch {
    return null;
  }
}

/**
 * Nimmt eine Datei des Anwenders in die App auf: Der Name wird zurechtgerückt,
 * ein belegter hochgezählt (nie überschrieben, siehe core/assets) und die Bytes
 * werden geschrieben — dann EIN Commit. Zurück kommt die Auskunft über das
 * Asset, wie es nun heißt.
 *
 * Eine Obergrenze gibt es bewusst nicht (e16): Was der Anwender in seine App
 * legt, ist seine Sache; die Bytes stehen einmal unter assets/ und wandern
 * nicht durch jeden Prompt.
 */
export async function addAsset(dir: string, name: string, data: Uint8Array): Promise<AssetInfo> {
  const folder = assetsDir(dir);
  fs.mkdirSync(folder, { recursive: true });

  const unique = uniqueAssetName(sanitizeAssetName(name), listAssets(dir).map((a) => a.name));
  // Geschrieben wird nur, was auch wieder gefunden wird: Eine Datei, die
  // `listAssets` nicht mehr als Asset gälte, läge unerreichbar im Ordner — und
  // der nächste gleiche Name überschriebe sie stillschweigend. core/assets hält
  // das ein; hier steht der Riegel, damit es dabei bleibt.
  if (!isAssetPath(assetPath(unique))) throw new Error(`Unbrauchbarer Asset-Name: ${name}`);
  fs.writeFileSync(path.join(folder, unique), data);

  const info = infoOf(unique, data.length);
  await ensureRepo(dir);
  await commitAll(dir, `Asset hinzugefügt: ${unique}`);
  return info;
}

/**
 * Entfernt genau dieses eine Asset und übernimmt das als Commit. `false`, wenn
 * es das Asset gar nicht gab — dann bleibt auch die Historie unangetastet.
 */
export async function removeAsset(dir: string, pathOrName: string): Promise<boolean> {
  const target = assetTarget(dir, pathOrName);
  if (!target) return false;
  try {
    if (!fs.statSync(target).isFile()) return false;
    fs.rmSync(target);
  } catch {
    return false;
  }
  await ensureRepo(dir);
  await commitAll(dir, `Asset entfernt: ${path.basename(target)}`);
  return true;
}
