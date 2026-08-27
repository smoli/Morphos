import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addAsset, assetDataUris, assetsDir, listAssets, pickAssets, readAsset, removeAsset } from './assetstore';
import { readSourceFiles, writeAppState } from './appstore';
import { listVersions, restoreVersion } from './gitstore';
import type { AppMeta } from '@/types';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-assets-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const META: AppMeta = { id: 'app-1', name: 'App', icon: '🧩', createdAt: 1, updatedAt: 2 };

/**
 * Bytes, die als Text nicht überleben würden: die Null, ein einzelnes 0x80
 * (kein gültiges UTF-8) und 0xFF. Genau daran zeigt sich ein UTF-8-Umweg.
 */
const BINARY = Buffer.from([0x00, 0x80, 0xff, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('addAsset / readAsset / listAssets', () => {
  it('legt das Asset unter assets/ ab und liest es Byte für Byte zurück', async () => {
    const info = await addAsset(dir, 'logo.png', BINARY);

    expect(info).toEqual({ name: 'logo.png', path: 'assets/logo.png', mime: 'image/png', size: BINARY.length });
    expect(fs.readFileSync(path.join(assetsDir(dir), 'logo.png')).equals(BINARY)).toBe(true);

    const read = readAsset(dir, 'assets/logo.png');
    expect(Buffer.from(read!.data).equals(BINARY)).toBe(true);
    expect(read!.mime).toBe('image/png');
  });

  it('liest ein Asset auch am bloßen Namen', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    expect(readAsset(dir, 'logo.png')!.size).toBe(BINARY.length);
  });

  it('liefert null für ein Asset, das es nicht gibt', () => {
    expect(readAsset(dir, 'assets/fehlt.png')).toBeNull();
  });

  it('lässt sich nicht aus dem Asset-Ordner herauslesen', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'x' }], 'x');
    expect(readAsset(dir, 'assets/../app.json')).toBeNull();
    expect(readAsset(dir, '../app.json')).toBeNull();
    expect(readAsset(dir, path.join(dir, 'app.json'))).toBeNull();
  });

  it('listet nur die Angaben, nie die Bytes — nach Namen sortiert', async () => {
    await addAsset(dir, 'zeichen.svg', Buffer.from('<svg/>'));
    await addAsset(dir, 'daten.json', Buffer.from('{}'));

    expect(listAssets(dir)).toEqual([
      { name: 'daten.json', path: 'assets/daten.json', mime: 'application/json', size: 2 },
      { name: 'zeichen.svg', path: 'assets/zeichen.svg', mime: 'image/svg+xml', size: 6 },
    ]);
  });

  it('liefert eine leere Liste, solange es keinen Asset-Ordner gibt', () => {
    expect(listAssets(dir)).toEqual([]);
    expect(fs.existsSync(assetsDir(dir))).toBe(false);
  });

  it('rückt den Namen zurecht und überschreibt nie stillschweigend', async () => {
    const first = await addAsset(dir, 'mein bild.png', BINARY);
    expect(first.name).toBe('mein-bild.png');

    const second = await addAsset(dir, 'mein bild.png', Buffer.from([1, 2, 3]));
    expect(second.name).toBe('mein-bild-2.png');

    expect(Buffer.from(readAsset(dir, first.path)!.data).equals(BINARY)).toBe(true);
    expect(listAssets(dir).map((a) => a.name)).toEqual(['mein-bild-2.png', 'mein-bild.png']);
  });

  it('zählt auch einen überlangen Namen hoch, statt ihn zu überschreiben', async () => {
    // Gekürzt wird auf denselben Anfang — gerade lange Namen stoßen also
    // aufeinander, und gerade dort darf nichts verlorengehen.
    const name = `${'x'.repeat(300)}.png`;
    const first = await addAsset(dir, name, Buffer.from([1]));
    const second = await addAsset(dir, name, Buffer.from([2]));
    const third = await addAsset(dir, name, Buffer.from([3]));

    expect(new Set([first.name, second.name, third.name]).size).toBe(3);
    expect(listAssets(dir).map((a) => a.name).sort()).toEqual([first.name, second.name, third.name].sort());

    // Jedes der drei ist erreichbar UND trägt noch seine eigenen Bytes.
    expect(Array.from(readAsset(dir, first.path)!.data)).toEqual([1]);
    expect(Array.from(readAsset(dir, second.path)!.data)).toEqual([2]);
    expect(Array.from(readAsset(dir, third.path)!.data)).toEqual([3]);

    // Und jedes lässt sich auch wieder entfernen.
    expect(await removeAsset(dir, second.path)).toBe(true);
    expect(listAssets(dir)).toHaveLength(2);
  });

  it('legt nur Dateien an, die es auch wieder findet', async () => {
    for (const raw of [`${'x'.repeat(300)}.png`, `a.${'b'.repeat(100)}`, 'ä'.repeat(200), '.'.repeat(90)]) {
      const info = await addAsset(dir, raw, Buffer.from([7]));
      expect(readAsset(dir, info.path)).not.toBeNull();
    }
    // Auf der Platte liegt nichts, was die Liste nicht kennt.
    expect(fs.readdirSync(assetsDir(dir)).sort()).toEqual(listAssets(dir).map((a) => a.name).sort());
  });

  it('kann aus einem Asset nicht ausbrechen', async () => {
    const info = await addAsset(dir, '../../boese.png', BINARY);
    expect(info.path).toBe('assets/boese.png');
    expect(fs.existsSync(path.join(dir, '..', '..', 'boese.png'))).toBe(false);
  });
});

describe('removeAsset', () => {
  it('löscht genau diese eine Datei', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    await addAsset(dir, 'schrift.woff2', Buffer.from([1, 2]));

    expect(await removeAsset(dir, 'assets/logo.png')).toBe(true);
    expect(listAssets(dir).map((a) => a.name)).toEqual(['schrift.woff2']);
  });

  it('meldet ein Asset, das es nicht gibt, als nicht gelöscht', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    expect(await removeAsset(dir, 'assets/fehlt.png')).toBe(false);
    expect(await removeAsset(dir, 'assets/../app.json')).toBe(false);
    expect(listAssets(dir)).toHaveLength(1);
  });
});

describe('Assets und der src/-Abgleich', () => {
  it('überlebt eine Generierung, die sie nie erwähnt', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'v1' }], 'v1');
    await addAsset(dir, 'logo.png', BINARY);

    writeAppState(dir, META, [{ path: 'src/neu.js', content: 'x' }], 'v2');

    expect(listAssets(dir).map((a) => a.name)).toEqual(['logo.png']);
    expect(Buffer.from(readAsset(dir, 'assets/logo.png')!.data).equals(BINARY)).toBe(true);
  });

  it('taucht nie unter den Quelldateien auf', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'v1' }], 'v1');
    await addAsset(dir, 'logo.png', BINARY);

    expect(readSourceFiles(dir).map((f) => f.path)).toEqual(['src/index.html']);
  });
});

describe('Assets und Git', () => {
  it('übernimmt das Hinzufügen und das Entfernen je als Commit', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'v1' }], 'v1');
    await addAsset(dir, 'logo.png', BINARY);

    const afterAdd = await listVersions(dir);
    expect(afterAdd).toHaveLength(1);
    expect(afterAdd[0].prompt).toContain('logo.png');

    await removeAsset(dir, 'assets/logo.png');

    const afterRemove = await listVersions(dir);
    expect(afterRemove).toHaveLength(2);
    expect(afterRemove[0].prompt).toContain('logo.png');
  });

  it('ist mitversioniert: ein Revert holt das Asset zurück', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'v1' }], 'v1');
    const added = await addAsset(dir, 'logo.png', BINARY);
    const sha = (await listVersions(dir))[0].sha;

    await removeAsset(dir, added.path);
    expect(listAssets(dir)).toEqual([]);

    await restoreVersion(dir, sha, 'Zurück zu: Asset hinzugefügt');

    expect(Buffer.from(readAsset(dir, added.path)!.data).equals(BINARY)).toBe(true);
  });
});

describe('assetDataUris — die Karte fürs Bündeln', () => {
  it('bildet jeden in-App-Pfad auf eine data:-URI mit dem richtigen Medientyp ab', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    await addAsset(dir, 'schrift.woff2', Buffer.from('wOF2'));
    await addAsset(dir, 'daten.json', Buffer.from('{"a":1}'));
    await addAsset(dir, 'zeichen.svg', Buffer.from('<svg/>'));

    const map = assetDataUris(dir);

    expect(Object.keys(map).sort()).toEqual([
      'assets/daten.json',
      'assets/logo.png',
      'assets/schrift.woff2',
      'assets/zeichen.svg',
    ]);
    expect(map['assets/logo.png']).toBe(`data:image/png;base64,${BINARY.toString('base64')}`);
    expect(map['assets/schrift.woff2']).toBe('data:font/woff2;base64,d09GMg==');
    expect(map['assets/daten.json'].startsWith('data:application/json;base64,')).toBe(true);
    // Auch das SVG kommt als base64 — eine Form für alle Typen.
    expect(map['assets/zeichen.svg']).toBe('data:image/svg+xml;base64,PHN2Zy8+');
  });

  it('lässt einen unbekannten Typ aus der Karte — die Referenz bleibt dann stehen', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    await addAsset(dir, 'unbekannt.bin', BINARY);

    expect(Object.keys(assetDataUris(dir))).toEqual(['assets/logo.png']);
  });

  it('liefert eine leere Karte, wenn die App keine Assets hat', () => {
    expect(assetDataUris(dir)).toEqual({});
  });
});

describe('pickAssets — die zu einem Wunsch mitgeschickten Beigaben (c0118)', () => {
  it('macht aus der Auswahl des Anwenders die Auskunft über die Dateien', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    await addAsset(dir, 'daten.json', Buffer.from('{}'));

    expect(pickAssets(dir, ['assets/logo.png'])).toEqual([
      { name: 'logo.png', path: 'assets/logo.png', mime: 'image/png', size: BINARY.length },
    ]);
  });

  it('nimmt auch den bloßen Namen an — behält aber die Reihenfolge der Auswahl', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    await addAsset(dir, 'daten.json', Buffer.from('{}'));

    expect(pickAssets(dir, ['daten.json', 'assets/logo.png']).map((a) => a.path))
      .toEqual(['assets/daten.json', 'assets/logo.png']);
  });

  it('lässt weg, was es gar nicht gibt — der Prompt nennt nur wirklich vorhandene Dateien', async () => {
    await addAsset(dir, 'logo.png', BINARY);

    expect(pickAssets(dir, ['assets/fehlt.png', 'assets/logo.png']).map((a) => a.name)).toEqual(['logo.png']);
    expect(pickAssets(dir, ['assets/fehlt.png'])).toEqual([]);
  });

  it('nennt dieselbe Beigabe nur einmal', async () => {
    await addAsset(dir, 'logo.png', BINARY);
    expect(pickAssets(dir, ['logo.png', 'assets/logo.png']).length).toBe(1);
  });

  it('führt aus dem Asset-Ordner nicht hinaus', async () => {
    writeAppState(dir, META, [{ path: 'src/index.html', content: 'x' }], 'x');
    expect(pickAssets(dir, ['assets/../app.json', '../app.json', path.join(dir, 'app.json')])).toEqual([]);
  });

  it('bleibt ohne Auswahl und ohne Asset-Ordner leer', () => {
    expect(pickAssets(dir, [])).toEqual([]);
    expect(pickAssets(dir, ['assets/logo.png'])).toEqual([]);
  });
});
