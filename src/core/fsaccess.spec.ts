import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { confineWithin, resolveWithin, runFs, runShellFs } from './fsaccess';
import type { TrashEntry } from '@/types';

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

// Die Verwaltungs-Operationen der Schale (c0050): anlegen, umbenennen,
// verschieben, kopieren — und der Papierkorb samt Rückweg.
describe('runShellFs', () => {
  let root: string;
  let outside: string;

  const write = (rel: string, data = 'x'): void => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data, 'utf8');
  };
  const exists = (rel: string): boolean => fs.existsSync(path.join(root, rel));
  const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');
  const trashItems = (): TrashEntry[] => {
    const res = runShellFs(root, { op: 'trashList', path: '' });
    expect(res.ok).toBe(true);
    return (res as { result: TrashEntry[] }).result;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-shell-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-shell-out-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  describe('anlegen und umbenennen', () => {
    it('legt einen Ordner an', () => {
      expect(runShellFs(root, { op: 'newFolder', path: 'sub', to: 'Notizen' }).ok).toBe(true);
      expect(fs.statSync(path.join(root, 'sub/Notizen')).isDirectory()).toBe(true);
    });

    it('lehnt untaugliche Namen ab — Pfadanteile, Verborgenes, Leeres', () => {
      expect(runShellFs(root, { op: 'newFolder', path: '', to: 'a/b' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'newFolder', path: '', to: '.trash' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'newFolder', path: '', to: '..' }).ok).toBe(false);
      expect(fs.readdirSync(root)).toEqual([]);
    });

    it('benennt um und lässt einen belegten Namen nur nach Rückfrage zu', () => {
      write('alt.txt', 'eins');
      expect(runShellFs(root, { op: 'rename', path: 'alt.txt', to: 'neu.txt' }).ok).toBe(true);
      expect(read('neu.txt')).toBe('eins');

      write('belegt.txt', 'zwei');
      const res = runShellFs(root, { op: 'rename', path: 'neu.txt', to: 'belegt.txt' });
      expect(res.ok).toBe(false);
      expect((res as { code?: string }).code).toBe('exists');
      expect(read('belegt.txt')).toBe('zwei');

      expect(runShellFs(root, { op: 'rename', path: 'neu.txt', to: 'belegt.txt', overwrite: true }).ok).toBe(true);
      expect(read('belegt.txt')).toBe('eins');
      expect(exists('neu.txt')).toBe(false);
    });
  });

  describe('verschieben und kopieren', () => {
    it('verschiebt einen Eintrag in einen anderen Ordner', () => {
      write('note.txt', 'inhalt');
      fs.mkdirSync(path.join(root, 'ziel'));
      expect(runShellFs(root, { op: 'move', path: 'note.txt', to: 'ziel' }).ok).toBe(true);
      expect(exists('note.txt')).toBe(false);
      expect(read('ziel/note.txt')).toBe('inhalt');
    });

    it('kopiert einen Ordner samt Inhalt', () => {
      write('quelle/tief/a.txt', 'a');
      fs.mkdirSync(path.join(root, 'ziel'));
      expect(runShellFs(root, { op: 'copy', path: 'quelle', to: 'ziel' }).ok).toBe(true);
      expect(read('quelle/tief/a.txt')).toBe('a');
      expect(read('ziel/quelle/tief/a.txt')).toBe('a');
    });

    it('gibt der Kopie im selben Ordner einen freien Namen', () => {
      write('note.txt', 'eins');
      const res = runShellFs(root, { op: 'copy', path: 'note.txt', to: '' });
      expect(res).toEqual({ ok: true, result: 'note (2).txt' });
      expect(read('note.txt')).toBe('eins');
      expect(read('note (2).txt')).toBe('eins');
    });

    it('fragt vor dem Überschreiben und überschreibt erst dann', () => {
      write('note.txt', 'neu');
      write('ziel/note.txt', 'alt');
      const res = runShellFs(root, { op: 'move', path: 'note.txt', to: 'ziel' });
      expect((res as { code?: string }).code).toBe('exists');
      expect(read('ziel/note.txt')).toBe('alt');

      expect(runShellFs(root, { op: 'move', path: 'note.txt', to: 'ziel', overwrite: true }).ok).toBe(true);
      expect(read('ziel/note.txt')).toBe('neu');
    });

    it('lässt einen Ordner nicht in sich selbst wandern', () => {
      write('ordner/tief/a.txt', 'a');
      expect(runShellFs(root, { op: 'move', path: 'ordner', to: 'ordner/tief' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'copy', path: 'ordner', to: 'ordner/tief' }).ok).toBe(false);
      expect(exists('ordner/tief/ordner')).toBe(false);
    });

    it('grenzt Quelle UND Ziel auf den Datenordner ein', () => {
      write('note.txt', 'geheim');
      fs.writeFileSync(path.join(outside, 'fremd.txt'), 'fremd', 'utf8');

      expect(runShellFs(root, { op: 'move', path: 'note.txt', to: '..' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'copy', path: 'note.txt', to: '../..' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'move', path: '../fremd.txt', to: '' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'rename', path: '../fremd.txt', to: 'meins.txt' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'newFolder', path: '..', to: 'ausbruch' }).ok).toBe(false);

      expect(read('note.txt')).toBe('geheim');
      expect(fs.readdirSync(outside)).toEqual(['fremd.txt']);
    });

    it('lässt auch über einen Symlink nichts hinaus', () => {
      write('note.txt', 'geheim');
      fs.symlinkSync(outside, path.join(root, 'link'));
      expect(runShellFs(root, { op: 'move', path: 'note.txt', to: 'link' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'copy', path: 'note.txt', to: 'link' }).ok).toBe(false);
      expect(fs.readdirSync(outside)).toEqual([]);
    });

    it('rührt den Papierkorb mit gewöhnlichen Operationen nicht an', () => {
      write('note.txt');
      runShellFs(root, { op: 'trash', path: 'note.txt' });
      fs.mkdirSync(path.join(root, 'ziel'));

      write('zweite.txt');
      expect(runShellFs(root, { op: 'move', path: '.trash/files/note.txt', to: 'ziel' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'copy', path: 'zweite.txt', to: '.trash/files' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'rename', path: '.trash', to: 'weg' }).ok).toBe(false);
      expect(trashItems()).toHaveLength(1);
    });
  });

  describe('Papierkorb', () => {
    it('löscht in den Papierkorb und stellt von dort wieder her', () => {
      write('sub/note.txt', 'inhalt');
      const del = runShellFs(root, { op: 'trash', path: 'sub/note.txt' });
      expect(del.ok).toBe(true);
      expect(exists('sub/note.txt')).toBe(false);

      const items = trashItems();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ name: 'note.txt', from: 'sub/note.txt', isDir: false });
      expect(items[0].deletedAt).toBeGreaterThan(0);

      const back = runShellFs(root, { op: 'restore', path: items[0].id });
      expect(back).toEqual({ ok: true, result: 'sub/note.txt' });
      expect(read('sub/note.txt')).toBe('inhalt');
      expect(trashItems()).toEqual([]);
    });

    it('nimmt einen Ordner samt Inhalt mit und bringt ihn zurück', () => {
      write('ordner/tief/a.txt', 'a');
      runShellFs(root, { op: 'trash', path: 'ordner' });
      expect(exists('ordner')).toBe(false);
      expect(trashItems()[0]).toMatchObject({ name: 'ordner', isDir: true });

      runShellFs(root, { op: 'restore', path: trashItems()[0].id });
      expect(read('ordner/tief/a.txt')).toBe('a');
    });

    it('legt den Ordner wieder an, wenn er inzwischen fehlt', () => {
      write('sub/note.txt', 'inhalt');
      runShellFs(root, { op: 'trash', path: 'sub/note.txt' });
      fs.rmSync(path.join(root, 'sub'), { recursive: true, force: true });

      expect(runShellFs(root, { op: 'restore', path: trashItems()[0].id }).ok).toBe(true);
      expect(read('sub/note.txt')).toBe('inhalt');
    });

    it('verdrängt im Papierkorb kein gleichnamiges Stück', () => {
      write('a/note.txt', 'eins');
      write('b/note.txt', 'zwei');
      runShellFs(root, { op: 'trash', path: 'a/note.txt' });
      runShellFs(root, { op: 'trash', path: 'b/note.txt' });

      const items = trashItems();
      expect(items).toHaveLength(2);
      expect(new Set(items.map((i) => i.id)).size).toBe(2);
      for (const item of items) expect(runShellFs(root, { op: 'restore', path: item.id }).ok).toBe(true);
      expect(read('a/note.txt')).toBe('eins');
      expect(read('b/note.txt')).toBe('zwei');
    });

    it('fragt nach, wenn am Herkunftsort inzwischen etwas liegt', () => {
      write('note.txt', 'alt');
      runShellFs(root, { op: 'trash', path: 'note.txt' });
      write('note.txt', 'neu');

      const id = trashItems()[0].id;
      const res = runShellFs(root, { op: 'restore', path: id });
      expect((res as { code?: string }).code).toBe('exists');
      expect(read('note.txt')).toBe('neu');

      expect(runShellFs(root, { op: 'restore', path: id, overwrite: true }).ok).toBe(true);
      expect(read('note.txt')).toBe('alt');
    });

    it('leert den Papierkorb endgültig', () => {
      write('eins.txt');
      write('zwei.txt');
      runShellFs(root, { op: 'trash', path: 'eins.txt' });
      runShellFs(root, { op: 'trash', path: 'zwei.txt' });

      expect(runShellFs(root, { op: 'emptyTrash', path: '' })).toEqual({ ok: true, result: 2 });
      expect(trashItems()).toEqual([]);
      expect(fs.readdirSync(path.join(root, '.trash/files'))).toEqual([]);
    });

    it('kennt keinen erfundenen Papierkorb-Eintrag', () => {
      expect(runShellFs(root, { op: 'restore', path: 'gibtsnicht' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'restore', path: '../../etc' }).ok).toBe(false);
      expect(runShellFs(root, { op: 'restore', path: 'sub/note.txt' }).ok).toBe(false);
    });

    it('meldet einen leeren Papierkorb, auch wenn es ihn noch gar nicht gibt', () => {
      expect(trashItems()).toEqual([]);
      expect(runShellFs(root, { op: 'emptyTrash', path: '' })).toEqual({ ok: true, result: 0 });
    });

    it('lehnt unbekannte Operationen ab', () => {
      expect(runShellFs(root, { op: 'boom' as never, path: 'x' }).ok).toBe(false);
    });
  });

  // Der Papierkorb gehört der Schale: Was eine App über morphos:fs anfragt,
  // sieht ihn nicht und kommt nicht hinein.
  describe('gegenüber den Apps verborgen', () => {
    it('lässt den Papierkorb aus der Liste heraus und jeden Zugriff darauf scheitern', () => {
      write('note.txt', 'inhalt');
      runShellFs(root, { op: 'trash', path: 'note.txt' });
      write('note.txt', 'neu');

      const res = runFs(root, { op: 'list', path: '' });
      const names = ((res as { result: { name: string }[] }).result).map((e) => e.name);
      expect(names).toEqual(['note.txt']);

      expect(runFs(root, { op: 'list', path: '.trash/files' }).ok).toBe(false);
      expect(runFs(root, { op: 'delete', path: '.trash' }).ok).toBe(false);
      expect(runFs(root, { op: 'write', path: '.trash/files/note.txt', data: 'kaputt' }).ok).toBe(false);
      expect(trashItems()).toHaveLength(1);
    });
  });
});
