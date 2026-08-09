import { describe, it, expect } from 'vitest';
import {
  TRASH_DIR,
  isTrashPath,
  isValidName,
  nameError,
  parseTrashMeta,
  splitName,
  uniqueName,
} from './trash';

describe('isTrashPath', () => {
  it('erkennt den Papierkorb und alles darin', () => {
    expect(isTrashPath(TRASH_DIR)).toBe(true);
    expect(isTrashPath('.trash/files/note.txt')).toBe(true);
    expect(isTrashPath('.trash/meta/note.txt.json')).toBe(true);
  });

  it('lässt alles andere durch — auch Namen, die nur so anfangen', () => {
    expect(isTrashPath('')).toBe(false);
    expect(isTrashPath('notizen/heute.txt')).toBe(false);
    expect(isTrashPath('.trashy/x')).toBe(false);
    expect(isTrashPath('sub/.trash/x')).toBe(false);
  });

  it('sieht den Papierkorb auch in unsauber geschriebenen Pfaden', () => {
    expect(isTrashPath('/.trash/files/a')).toBe(true);
    expect(isTrashPath('.\\trash')).toBe(false);
    expect(isTrashPath('.trash\\files\\a')).toBe(true);
    expect(isTrashPath('sub/../.trash/a')).toBe(true);
  });
});

describe('isValidName', () => {
  it('nimmt gewöhnliche Datei- und Ordnernamen', () => {
    expect(isValidName('Notizen')).toBe(true);
    expect(isValidName('brief 2026.txt')).toBe(true);
    expect(isValidName('archiv.tar.gz')).toBe(true);
  });

  it('weist Pfadanteile, Punkte und Steuerzeichen ab', () => {
    expect(isValidName('')).toBe(false);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('a/b')).toBe(false);
    expect(isValidName('a\\b')).toBe(false);
    expect(isValidName('.')).toBe(false);
    expect(isValidName('..')).toBe(false);
    expect(isValidName('a\u0000b')).toBe(false);
    expect(isValidName('a\nb')).toBe(false);
    expect(isValidName('was?.txt')).toBe(false);
    expect(isValidName('x'.repeat(256))).toBe(false);
  });

  it('weist Verborgenes ab — was mit Punkt beginnt, sähe der Anwender nie wieder', () => {
    expect(isValidName('.trash')).toBe(false);
    expect(isValidName('.geheim.txt')).toBe(false);
  });

  it('nennt den Grund für einen abgelehnten Namen', () => {
    expect(nameError('gut.txt')).toBe('');
    expect(nameError('a/b')).toContain('Name');
    expect(nameError('.x')).toContain('Punkt');
  });
});

describe('splitName', () => {
  it('trennt Endung von Rumpf — die letzte Endung zählt', () => {
    expect(splitName('note.txt')).toEqual({ base: 'note', ext: '.txt' });
    expect(splitName('archiv.tar.gz')).toEqual({ base: 'archiv.tar', ext: '.gz' });
    expect(splitName('Notizen')).toEqual({ base: 'Notizen', ext: '' });
    expect(splitName('.gitignore')).toEqual({ base: '.gitignore', ext: '' });
  });
});

describe('uniqueName', () => {
  it('lässt einen freien Namen unangetastet', () => {
    expect(uniqueName(['a.txt'], 'b.txt')).toBe('b.txt');
  });

  it('zählt vor der Endung hoch, bis der Name frei ist', () => {
    expect(uniqueName(['note.txt'], 'note.txt')).toBe('note (2).txt');
    expect(uniqueName(['note.txt', 'note (2).txt'], 'note.txt')).toBe('note (3).txt');
    expect(uniqueName(['Ordner'], 'Ordner')).toBe('Ordner (2)');
  });
});

describe('parseTrashMeta', () => {
  it('liest einen Eintrag samt Herkunft', () => {
    const item = parseTrashMeta({ name: 'note.txt', from: 'sub/note.txt', deletedAt: 42, isDir: false }, 'note.txt');
    expect(item).toEqual({ id: 'note.txt', name: 'note.txt', from: 'sub/note.txt', deletedAt: 42, isDir: false });
  });

  it('lässt eine Herkunft außerhalb des Datenordners nicht gelten', () => {
    expect(parseTrashMeta({ name: 'x', from: '../../x', deletedAt: 1 }, 'x')).toBeNull();
    expect(parseTrashMeta({ name: 'x', from: '', deletedAt: 1 }, 'x')).toBeNull();
  });

  it('gibt bei Unfug null zurück statt zu raten', () => {
    expect(parseTrashMeta(null, 'x')).toBeNull();
    expect(parseTrashMeta({ from: 'a' }, '')).toBeNull();
  });

  it('füllt Fehlendes verträglich auf', () => {
    const item = parseTrashMeta({ from: 'sub/note.txt' }, 'note.txt');
    expect(item).toEqual({ id: 'note.txt', name: 'note.txt', from: 'sub/note.txt', deletedAt: 0, isDir: false });
  });
});
