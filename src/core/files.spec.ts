import { describe, it, expect } from 'vitest';
import {
  FILE_MARKER,
  isValidSourcePath,
  serializeFiles,
  parseLLMOutput,
  applyChanges,
} from './files';
import type { SourceFile } from '@/types';

const INDEX = '<!DOCTYPE html><html><head><title>X</title></head><body></body></html>';

describe('isValidSourcePath', () => {
  it('erlaubt nur Pfade unter src/', () => {
    expect(isValidSourcePath('src/index.html')).toBe(true);
    expect(isValidSourcePath('src/ui/menu.js')).toBe(true);
    expect(isValidSourcePath('index.html')).toBe(false);
    expect(isValidSourcePath('app.json')).toBe(false);
    expect(isValidSourcePath('.git/config')).toBe(false);
  });

  it('verhindert Traversal und ungültige Zeichen', () => {
    expect(isValidSourcePath('src/../geheim.txt')).toBe(false);
    expect(isValidSourcePath('src/a/../../b')).toBe(false);
    expect(isValidSourcePath('src//doppelt.js')).toBe(false);
    expect(isValidSourcePath('src/')).toBe(false);
    expect(isValidSourcePath('src/ordner/')).toBe(false);
    expect(isValidSourcePath('/src/abs.js')).toBe(false);
    expect(isValidSourcePath('src\\win.js')).toBe(false);
    expect(isValidSourcePath('src/mit leerzeichen.js')).toBe(false);
    expect(isValidSourcePath('')).toBe(false);
  });
});

describe('serializeFiles', () => {
  it('gibt jede Datei als markierten Block aus', () => {
    const files: SourceFile[] = [
      { path: 'src/index.html', content: INDEX },
      { path: 'src/app.js', content: 'let x = 1;' },
    ];
    const out = serializeFiles(files);
    expect(out).toContain(`${FILE_MARKER}FILE src/index.html===`);
    expect(out).toContain(INDEX);
    expect(out).toContain(`${FILE_MARKER}FILE src/app.js===`);
    expect(out).toContain('let x = 1;');
    expect(out).toContain(`${FILE_MARKER}END===`);
  });
});

describe('parseLLMOutput', () => {
  it('liest FILE-Blöcke mit Pfad und Inhalt', () => {
    const raw = [
      '===MORPHOS:FILE src/index.html===',
      INDEX,
      '===MORPHOS:END===',
      '===MORPHOS:FILE src/app.js===',
      'const a = 1;',
      'const b = 2;',
      '===MORPHOS:END===',
    ].join('\n');
    const changes = parseLLMOutput(raw);
    expect(changes.files).toHaveLength(2);
    expect(changes.files[0]).toEqual({ path: 'src/index.html', content: INDEX });
    expect(changes.files[1].content).toBe('const a = 1;\nconst b = 2;');
    expect(changes.deletions).toEqual([]);
  });

  it('liest DELETE-Blöcke', () => {
    const raw = [
      '===MORPHOS:FILE src/index.html===',
      INDEX,
      '===MORPHOS:END===',
      '===MORPHOS:DELETE src/alt.js===',
    ].join('\n');
    const changes = parseLLMOutput(raw);
    expect(changes.files).toHaveLength(1);
    expect(changes.deletions).toEqual(['src/alt.js']);
  });

  it('ignoriert erklärenden Text um die Blöcke herum', () => {
    const raw = `Hier ist die Änderung:\n\n===MORPHOS:FILE src/app.js===\nx();\n===MORPHOS:END===\n\nFertig!`;
    const changes = parseLLMOutput(raw);
    expect(changes.files).toEqual([{ path: 'src/app.js', content: 'x();' }]);
  });

  it('verwirft Dateien mit ungültigen Pfaden', () => {
    const raw = [
      '===MORPHOS:FILE ../boese.js===',
      'x',
      '===MORPHOS:END===',
      '===MORPHOS:FILE src/gut.js===',
      'y',
      '===MORPHOS:END===',
      '===MORPHOS:DELETE ../../etc/passwd===',
    ].join('\n');
    const changes = parseLLMOutput(raw);
    expect(changes.files).toEqual([{ path: 'src/gut.js', content: 'y' }]);
    expect(changes.deletions).toEqual([]);
  });

  it('fällt bei reinem HTML-Dokument auf src/index.html zurück (Alt-Verhalten)', () => {
    const changes = parseLLMOutput('Hier:\n```html\n' + INDEX + '\n```');
    expect(changes.files).toEqual([{ path: 'src/index.html', content: INDEX }]);
    expect(changes.deletions).toEqual([]);
  });

  it('liefert leere Änderungen bei unbrauchbarer Ausgabe', () => {
    const changes = parseLLMOutput('Ich kann dazu nichts sagen.');
    expect(changes.files).toEqual([]);
    expect(changes.deletions).toEqual([]);
    expect(changes.say).toBeUndefined();
  });

  it('liest eine reine Rückfrage (SAY ohne Dateien)', () => {
    const raw = [
      '===MORPHOS:SAY===',
      'Soll der Rechner auch Prozent können?',
      '===MORPHOS:END===',
    ].join('\n');
    const changes = parseLLMOutput(raw);
    expect(changes.say).toBe('Soll der Rechner auch Prozent können?');
    expect(changes.files).toEqual([]);
    expect(changes.deletions).toEqual([]);
  });

  it('liest SAY zusammen mit Dateiänderungen', () => {
    const raw = [
      '===MORPHOS:SAY===',
      'Ich habe die Buttons vergrößert.',
      '===MORPHOS:END===',
      '===MORPHOS:FILE src/app.js===',
      'x();',
      '===MORPHOS:END===',
    ].join('\n');
    const changes = parseLLMOutput(raw);
    expect(changes.say).toBe('Ich habe die Buttons vergrößert.');
    expect(changes.files).toEqual([{ path: 'src/app.js', content: 'x();' }]);
  });

  it('fällt bei vorhandener SAY-Nachricht NICHT auf das HTML-Dokument zurück', () => {
    const raw = [
      '===MORPHOS:SAY===',
      `Meinst du so etwas wie ${INDEX}?`,
      '===MORPHOS:END===',
    ].join('\n');
    const changes = parseLLMOutput(raw);
    expect(changes.files).toEqual([]);
    expect(changes.say).toContain('Meinst du');
  });
});

describe('applyChanges', () => {
  const base: SourceFile[] = [
    { path: 'src/index.html', content: 'alt' },
    { path: 'src/app.js', content: 'a' },
  ];

  it('überschreibt, ergänzt und löscht Dateien', () => {
    const next = applyChanges(base, {
      files: [
        { path: 'src/index.html', content: 'neu' },
        { path: 'src/style.css', content: 'body{}' },
      ],
      deletions: ['src/app.js'],
    });
    expect(next.map((f) => f.path).sort()).toEqual(['src/index.html', 'src/style.css']);
    expect(next.find((f) => f.path === 'src/index.html')!.content).toBe('neu');
  });

  it('lässt den Ausgangssatz unangetastet (keine Mutation)', () => {
    applyChanges(base, { files: [{ path: 'src/x.js', content: 'x' }], deletions: ['src/app.js'] });
    expect(base).toHaveLength(2);
    expect(base[0].content).toBe('alt');
  });

  it('liefert die Dateien stabil nach Pfad sortiert', () => {
    const next = applyChanges(base, { files: [{ path: 'src/a.js', content: '1' }], deletions: [] });
    expect(next.map((f) => f.path)).toEqual(['src/a.js', 'src/app.js', 'src/index.html']);
  });
});
