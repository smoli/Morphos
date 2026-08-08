import { describe, it, expect, vi } from 'vitest';
import {
  DIALOG_KINDS,
  applyDefaultExtension,
  breadcrumbs,
  dispatchDialogRequest,
  joinRelPath,
  matchesExtensions,
  normalizeExtensions,
  normalizeRelPath,
  parentDir,
  parseDialogRequest,
  sanitizeFileName,
  visibleEntries,
} from './dialog';
import type { DialogRequest, FsEntry } from '@/types';

describe('normalizeRelPath', () => {
  it('liefert einen "/"-getrennten relativen Pfad', () => {
    expect(normalizeRelPath('notizen/heute.txt')).toBe('notizen/heute.txt');
    expect(normalizeRelPath('notizen\\heute.txt')).toBe('notizen/heute.txt');
    expect(normalizeRelPath('./a//b/')).toBe('a/b');
  });

  it('behandelt den leeren Pfad als den Datenordner selbst', () => {
    expect(normalizeRelPath('')).toBe('');
    expect(normalizeRelPath(undefined)).toBe('');
    expect(normalizeRelPath('/')).toBe('');
  });

  it('macht absolute Pfade relativ, statt auszubrechen', () => {
    expect(normalizeRelPath('/etc/passwd')).toBe('etc/passwd');
    expect(normalizeRelPath('C:\\Windows\\x.ini')).toBe('Windows/x.ini');
  });

  it('löst ".." innerhalb des Ordners auf', () => {
    expect(normalizeRelPath('a/../b.txt')).toBe('b.txt');
    expect(normalizeRelPath('a/b/../../c')).toBe('c');
  });

  it('weist einen Ausbruch über ".." zurück', () => {
    expect(normalizeRelPath('../geheim')).toBeNull();
    expect(normalizeRelPath('a/../../geheim')).toBeNull();
    expect(normalizeRelPath('..')).toBeNull();
  });
});

describe('joinRelPath / parentDir / breadcrumbs', () => {
  it('hängt einen Namen an einen Ordner an', () => {
    expect(joinRelPath('', 'a.txt')).toBe('a.txt');
    expect(joinRelPath('notizen', 'a.txt')).toBe('notizen/a.txt');
    expect(joinRelPath('notizen/', 'a.txt')).toBe('notizen/a.txt');
  });

  it('führt zum übergeordneten Ordner, aber nicht über den Datenordner hinaus', () => {
    expect(parentDir('a/b/c')).toBe('a/b');
    expect(parentDir('a')).toBe('');
    expect(parentDir('')).toBe('');
  });

  it('zerlegt den Pfad in anklickbare Wegmarken', () => {
    expect(breadcrumbs('')).toEqual([]);
    expect(breadcrumbs('a/b')).toEqual([
      { name: 'a', path: 'a' },
      { name: 'b', path: 'a/b' },
    ]);
  });
});

describe('Dateinamen und Endungen', () => {
  it('reduziert eine Eingabe auf einen einfachen Dateinamen', () => {
    expect(sanitizeFileName('a.txt')).toBe('a.txt');
    expect(sanitizeFileName('  a.txt  ')).toBe('a.txt');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('ordner\\datei.txt')).toBe('datei.txt');
    expect(sanitizeFileName('..')).toBe('');
    expect(sanitizeFileName(null)).toBe('');
  });

  it('normalisiert Endungen (ohne Punkt, klein, ohne Dubletten)', () => {
    expect(normalizeExtensions(['.TXT', 'md', 'txt', '', null])).toEqual(['txt', 'md']);
    expect(normalizeExtensions('txt')).toEqual([]);
    expect(normalizeExtensions(undefined)).toEqual([]);
  });

  it('filtert Dateien nach den erlaubten Endungen', () => {
    expect(matchesExtensions('a.txt', ['txt', 'md'])).toBe(true);
    expect(matchesExtensions('A.TXT', ['txt'])).toBe(true);
    expect(matchesExtensions('a.png', ['txt'])).toBe(false);
    // Ohne Filter ist alles erlaubt.
    expect(matchesExtensions('a.png', [])).toBe(true);
  });

  it('ergänzt beim Speichern die erste Endung, wenn keine getippt wurde', () => {
    expect(applyDefaultExtension('notizen', ['txt', 'md'])).toBe('notizen.txt');
    // Eine bereits getippte Endung bleibt unangetastet — auch eine andere.
    expect(applyDefaultExtension('notizen.md', ['txt'])).toBe('notizen.md');
    expect(applyDefaultExtension('notizen', [])).toBe('notizen');
    expect(applyDefaultExtension('  ', ['txt'])).toBe('');
  });
});

describe('visibleEntries', () => {
  const entries: FsEntry[] = [
    { name: 'zebra.txt', path: 'zebra.txt', isDir: false },
    { name: 'bilder', path: 'bilder', isDir: true },
    { name: 'a.png', path: 'a.png', isDir: false },
    { name: 'Archiv', path: 'Archiv', isDir: true },
  ];

  it('zeigt Ordner zuerst, dann alphabetisch', () => {
    expect(visibleEntries(entries, 'open', []).map((e) => e.name)).toEqual([
      'Archiv',
      'bilder',
      'a.png',
      'zebra.txt',
    ]);
  });

  it('blendet bei einem Endungsfilter die übrigen Dateien aus (Ordner bleiben)', () => {
    expect(visibleEntries(entries, 'open', ['txt']).map((e) => e.name)).toEqual([
      'Archiv',
      'bilder',
      'zebra.txt',
    ]);
  });

  it('zeigt bei der Ordnerauswahl nur Ordner', () => {
    expect(visibleEntries(entries, 'directory', []).map((e) => e.name)).toEqual(['Archiv', 'bilder']);
  });
});

describe('parseDialogRequest', () => {
  it('erkennt die drei Dialogarten', () => {
    expect([...DIALOG_KINDS].sort()).toEqual(['directory', 'open', 'save']);
    for (const kind of DIALOG_KINDS) {
      expect(parseDialogRequest({ dialog: kind })?.kind).toBe(kind);
    }
  });

  it('weist unbekannte Dialogarten zurück', () => {
    expect(parseDialogRequest({ dialog: 'evil' })).toBeNull();
    expect(parseDialogRequest({})).toBeNull();
    expect(parseDialogRequest(null)).toBeNull();
  });

  it('normalisiert die Optionen der App', () => {
    const req = parseDialogRequest({
      dialog: 'save',
      options: { suggestedName: '../notizen.TXT', startDir: '/texte/', extensions: ['.TXT'], title: '  Ablegen  ' },
    });
    expect(req).toEqual({
      kind: 'save',
      startDir: 'texte',
      extensions: ['txt'],
      suggestedName: 'notizen.TXT',
      title: 'Ablegen',
    });
  });

  it('setzt einen ausbrechenden Startordner auf den Datenordner zurück', () => {
    expect(parseDialogRequest({ dialog: 'open', options: { startDir: '../../' } })?.startDir).toBe('');
  });
});

describe('dispatchDialogRequest', () => {
  const pick = vi.fn(async (): Promise<string | null> => 'notizen/a.txt');

  it('liefert den gewählten Pfad relativ zum Datenordner', async () => {
    pick.mockClear();
    const res = await dispatchDialogRequest({ dialog: 'open' }, '/data', pick);
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'open' }));
    expect(res).toEqual({ ok: true, result: 'notizen/a.txt' });
  });

  it('liefert bei Abbruch null (kein Fehler)', async () => {
    const res = await dispatchDialogRequest({ dialog: 'open' }, '/data', async () => null);
    expect(res).toEqual({ ok: true, result: null });
  });

  it('lehnt ab, wenn kein Datenordner festgelegt ist', async () => {
    pick.mockClear();
    const res = await dispatchDialogRequest({ dialog: 'open' }, null, pick);
    expect(res.ok).toBe(false);
    expect(pick).not.toHaveBeenCalled();
  });

  it('lehnt unbekannte Dialogarten ab', async () => {
    pick.mockClear();
    const res = await dispatchDialogRequest({ dialog: 'evil' }, '/data', pick);
    expect(res.ok).toBe(false);
    expect(pick).not.toHaveBeenCalled();
  });

  it('grenzt auch ein ausbrechendes Ergebnis auf den Datenordner ein', async () => {
    const res = await dispatchDialogRequest({ dialog: 'open' }, '/data', async () => '../../etc/passwd');
    expect(res.ok).toBe(false);
  });

  it('normalisiert das Ergebnis auf "/"-Trenner', async () => {
    const res = await dispatchDialogRequest({ dialog: 'save' }, '/data', async () => 'a\\b.txt');
    expect(res).toEqual({ ok: true, result: 'a/b.txt' });
  });

  it('gibt den Datenordner selbst als leeren Pfad zurück', async () => {
    const res = await dispatchDialogRequest({ dialog: 'directory' }, '/data', async () => '');
    expect(res).toEqual({ ok: true, result: '' });
  });

  it('macht einen Fehler des Pickers für die App fangbar', async () => {
    const res = await dispatchDialogRequest({ dialog: 'open' }, '/data', async () => {
      throw new Error('Es ist bereits ein Dateidialog geöffnet.');
    });
    expect(res).toEqual({ ok: false, error: 'Es ist bereits ein Dateidialog geöffnet.' });
  });

  it('reicht Startordner, Endungen und Vorschlag an den Picker durch', async () => {
    let seen: DialogRequest | null = null;
    await dispatchDialogRequest(
      { dialog: 'save', options: { startDir: 'texte', extensions: ['md'], suggestedName: 'neu' } },
      '/data',
      async (req) => {
        seen = req;
        return null;
      },
    );
    expect(seen).toEqual({ kind: 'save', startDir: 'texte', extensions: ['md'], suggestedName: 'neu' });
  });
});
