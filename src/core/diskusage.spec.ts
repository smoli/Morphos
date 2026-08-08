import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectDiskUsage, folderSize } from './diskusage';

/** Legt eine Datei mit genau `bytes` Bytes an und liefert diese Zahl zurück. */
function writeFile(file: string, bytes: number): number {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x'.repeat(bytes), 'utf8');
  return bytes;
}

/** Legt ein App-Manifest an und liefert seine Größe in Bytes. */
function writeManifest(dir: string, id: string, name: string, icon: string): number {
  fs.mkdirSync(dir, { recursive: true });
  const json = JSON.stringify({ id, name, icon, createdAt: 1, updatedAt: 2 }, null, 2);
  fs.writeFileSync(path.join(dir, 'app.json'), json, 'utf8');
  return Buffer.byteLength(json, 'utf8');
}

describe('folderSize', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-size-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('summiert die Dateien eines Ordners samt Unterordnern', async () => {
    const expected =
      writeFile(path.join(root, 'a.txt'), 1000) +
      writeFile(path.join(root, 'unter', 'b.txt'), 2000) +
      writeFile(path.join(root, 'unter', 'tiefer', 'c.txt'), 34);

    expect(await folderSize(root)).toBe(expected);
  });

  it('zählt einen leeren Ordner als nichts', async () => {
    fs.mkdirSync(path.join(root, 'leer'));
    expect(await folderSize(path.join(root, 'leer'))).toBe(0);
  });

  it('liefert für einen unbekannten Ordner 0, statt zu werfen', async () => {
    expect(await folderSize(path.join(root, 'gibt-es-nicht'))).toBe(0);
  });

  it('folgt keinen Symlinks (die Größe bleibt die des Ordners selbst)', async () => {
    const außen = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-aussen-'));
    try {
      writeFile(path.join(außen, 'groß.txt'), 5000);
      const expected = writeFile(path.join(root, 'a.txt'), 100);
      fs.symlinkSync(außen, path.join(root, 'verweis'), 'dir');
      fs.symlinkSync(path.join(außen, 'groß.txt'), path.join(root, 'verweis.txt'), 'file');

      expect(await folderSize(root)).toBe(expected);
    } finally {
      fs.rmSync(außen, { recursive: true, force: true });
    }
  });
});

describe('collectDiskUsage', () => {
  let folder: string;
  let data: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-apps-'));
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-daten-'));
  });
  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  });

  it('führt jede App mit ihrem Ordner auf, die größte zuerst', async () => {
    const klein =
      writeManifest(path.join(folder, 'notizen'), 'notizen', 'Notizen', '📝') +
      writeFile(path.join(folder, 'notizen', 'src', 'index.html'), 500);
    const groß =
      writeManifest(path.join(folder, 'rechner'), 'rechner', 'Rechner', '🧮') +
      writeFile(path.join(folder, 'rechner', 'src', 'index.html'), 4000);

    const usage = await collectDiskUsage(folder, null);

    expect(usage.apps).toEqual([
      { id: 'rechner', name: 'Rechner', icon: '🧮', bytes: groß },
      { id: 'notizen', name: 'Notizen', icon: '📝', bytes: klein },
    ]);
    expect(usage.appsBytes).toBe(groß + klein);
  });

  it('übergeht Ordner ohne Manifest und lose Dateien im Arbeitsverzeichnis', async () => {
    const app =
      writeManifest(path.join(folder, 'rechner'), 'rechner', 'Rechner', '🧮') +
      writeFile(path.join(folder, 'rechner', 'src', 'index.html'), 40);
    writeFile(path.join(folder, 'fremd', 'egal.txt'), 9999);
    writeFile(path.join(folder, 'lose.txt'), 8888);

    const usage = await collectDiskUsage(folder, null);

    expect(usage.apps.map((a) => a.id)).toEqual(['rechner']);
    expect(usage.appsBytes).toBe(app);
  });

  it('misst den Datenordner getrennt von den Apps', async () => {
    writeManifest(path.join(folder, 'rechner'), 'rechner', 'Rechner', '🧮');
    const inhalt = writeFile(path.join(data, 'unter', 'liste.json'), 1234);

    const usage = await collectDiskUsage(folder, data);

    expect(usage.data).toEqual({ path: data, bytes: inhalt });
  });

  it('hat ohne festgelegten Datenordner keinen', async () => {
    const usage = await collectDiskUsage(folder, null);
    expect(usage.data).toBeNull();
  });

  it('liefert für ein unbekanntes Arbeitsverzeichnis eine leere Aufstellung', async () => {
    const usage = await collectDiskUsage(path.join(folder, 'gibt-es-nicht'), null);
    expect(usage).toEqual({ apps: [], appsBytes: 0, data: null });
  });

  it('nimmt den Ordnernamen, wenn das Manifest keinen Namen trägt', async () => {
    fs.mkdirSync(path.join(folder, 'ohne-namen'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'ohne-namen', 'app.json'), '{}', 'utf8');

    const usage = await collectDiskUsage(folder, null);

    expect(usage.apps[0]).toMatchObject({ id: 'ohne-namen', name: 'ohne-namen', icon: '🧩' });
  });
});
