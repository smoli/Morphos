import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confineWithin, resolveWithin, runFs } from './fsaccess';

describe('confineWithin', () => {
  const root = path.resolve('/data/workspace');

  it('erlaubt Pfade innerhalb des Zugriffsordners', () => {
    const p = confineWithin(root, 'notes/today.txt');
    expect(p).not.toBeNull();
    expect(p!.startsWith(root)).toBe(true);
  });

  it('gibt den Ordner selbst für leeren Pfad zurück', () => {
    expect(confineWithin(root, '')).toBe(root);
    expect(confineWithin(root, '.')).toBe(root);
  });

  it('verhindert Traversal mit ..', () => {
    expect(confineWithin(root, '../geheim.txt')).toBeNull();
    expect(confineWithin(root, 'a/../../b')).toBeNull();
    expect(confineWithin(root, '..')).toBeNull();
  });

  it('behandelt absolute Pfade als relativ zum Ordner (kein Ausbruch)', () => {
    const p = confineWithin(root, 'C:\\Windows\\system32');
    expect(p).not.toBeNull();
    expect(p!.startsWith(root)).toBe(true);
    const q = confineWithin(root, '/etc/passwd');
    expect(q).not.toBeNull();
    expect(q!.startsWith(root)).toBe(true);
  });
});

// Der geprüfte Zielpfad — auch der Dateistrom des Explorers geht hier durch.
describe('resolveWithin', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-res-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-res-out-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('liefert den absoluten Pfad innerhalb des Ordners', () => {
    fs.writeFileSync(path.join(root, 'bild.png'), 'x');
    expect(resolveWithin(root, 'bild.png')).toBe(path.join(root, 'bild.png'));
  });

  it('verweigert Traversal und Symlinks nach außen', () => {
    fs.writeFileSync(path.join(outside, 'geheim.txt'), 'x');
    fs.symlinkSync(outside, path.join(root, 'link'));
    expect(resolveWithin(root, '../geheim.txt')).toBeNull();
    expect(resolveWithin(root, 'link/geheim.txt')).toBeNull();
  });

  it('verweigert, was sich nicht auflösen lässt (kaputter Symlink)', () => {
    fs.symlinkSync(path.join(outside, 'gibt-es-nicht'), path.join(root, 'tot'));
    fs.rmSync(outside, { recursive: true, force: true });
    expect(resolveWithin(root, 'tot')).toBeNull();
  });
});

describe('runFs', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-fs-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('schreibt eine Datei (inkl. Elternordner) und liest sie wieder', () => {
    const w = runFs(root, { op: 'write', path: 'sub/dir/note.txt', data: 'Hallo Welt' });
    expect(w.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, 'sub/dir/note.txt'), 'utf8')).toBe('Hallo Welt');

    const r = runFs(root, { op: 'read', path: 'sub/dir/note.txt' });
    expect(r).toEqual({ ok: true, result: 'Hallo Welt' });
  });

  it('listet Verzeichnisinhalte', () => {
    runFs(root, { op: 'write', path: 'a.txt', data: 'x' });
    runFs(root, { op: 'mkdir', path: 'ordner' });
    const res = runFs(root, { op: 'list', path: '' });
    expect(res.ok).toBe(true);
    const entries = (res as { result: { name: string; isDir: boolean }[] }).result;
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['a.txt', 'ordner']);
    expect(entries.find((e) => e.name === 'ordner')!.isDir).toBe(true);
  });

  it('prüft Existenz', () => {
    runFs(root, { op: 'write', path: 'da.txt', data: 'x' });
    expect(runFs(root, { op: 'exists', path: 'da.txt' })).toEqual({ ok: true, result: true });
    expect(runFs(root, { op: 'exists', path: 'weg.txt' })).toEqual({ ok: true, result: false });
  });

  it('liefert Metadaten über stat', () => {
    runFs(root, { op: 'write', path: 'f.txt', data: 'abcde' });
    const res = runFs(root, { op: 'stat', path: 'f.txt' });
    expect(res.ok).toBe(true);
    const info = (res as { result: { exists: boolean; isDir: boolean; size: number } }).result;
    expect(info.exists).toBe(true);
    expect(info.isDir).toBe(false);
    expect(info.size).toBe(5);
  });

  it('legt Verzeichnisse an und löscht Einträge', () => {
    expect(runFs(root, { op: 'mkdir', path: 'x/y' }).ok).toBe(true);
    expect(fs.existsSync(path.join(root, 'x/y'))).toBe(true);

    runFs(root, { op: 'write', path: 'x/y/f.txt', data: '1' });
    expect(runFs(root, { op: 'delete', path: 'x/y/f.txt' }).ok).toBe(true);
    expect(fs.existsSync(path.join(root, 'x/y/f.txt'))).toBe(false);
  });

  it('meldet einen Fehler beim Lesen einer fehlenden Datei', () => {
    const res = runFs(root, { op: 'read', path: 'gibtsnicht.txt' });
    expect(res.ok).toBe(false);
  });

  it('weist jede Operation außerhalb des Ordners ab', () => {
    expect(runFs(root, { op: 'read', path: '../../etc/passwd' }).ok).toBe(false);
    expect(runFs(root, { op: 'write', path: '../escape.txt', data: 'x' }).ok).toBe(false);
    expect(runFs(root, { op: 'delete', path: '..' }).ok).toBe(false);
    // Es darf nichts außerhalb geschrieben worden sein.
    expect(fs.existsSync(path.join(root, '..', 'escape.txt'))).toBe(false);
  });

  it('lehnt unbekannte Operationen ab', () => {
    expect(runFs(root, { op: 'boom' as never, path: 'x' }).ok).toBe(false);
  });

  describe('Symlinks', () => {
    let outside: string;

    beforeEach(() => {
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-outside-'));
      fs.writeFileSync(path.join(outside, 'geheim.txt'), 'streng geheim', 'utf8');
    });
    afterEach(() => {
      fs.rmSync(outside, { recursive: true, force: true });
    });

    it('verweigert Lesen durch einen Symlink-Ordner nach außen', () => {
      fs.symlinkSync(outside, path.join(root, 'link'));
      expect(runFs(root, { op: 'read', path: 'link/geheim.txt' }).ok).toBe(false);
      expect(runFs(root, { op: 'list', path: 'link' }).ok).toBe(false);
    });

    it('verweigert Schreiben durch einen Symlink nach außen', () => {
      fs.symlinkSync(outside, path.join(root, 'link'));
      expect(runFs(root, { op: 'write', path: 'link/neu.txt', data: 'x' }).ok).toBe(false);
      expect(fs.existsSync(path.join(outside, 'neu.txt'))).toBe(false);
    });

    it('verweigert Zugriff auf eine direkt verlinkte Datei außerhalb', () => {
      fs.symlinkSync(path.join(outside, 'geheim.txt'), path.join(root, 'datei.txt'));
      expect(runFs(root, { op: 'read', path: 'datei.txt' }).ok).toBe(false);
    });

    it('erlaubt Symlinks, die innerhalb des Ordners bleiben', () => {
      fs.mkdirSync(path.join(root, 'echt'));
      fs.writeFileSync(path.join(root, 'echt/inhalt.txt'), 'ok', 'utf8');
      fs.symlinkSync(path.join(root, 'echt'), path.join(root, 'alias'));
      expect(runFs(root, { op: 'read', path: 'alias/inhalt.txt' })).toEqual({ ok: true, result: 'ok' });
    });
  });
});
