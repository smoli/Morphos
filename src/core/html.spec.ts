import { describe, it, expect } from 'vitest';
import { extractHtml, extractTitle, extractIcon } from './html';

describe('extractHtml', () => {
  it('gibt für leere Eingabe einen leeren String zurück', () => {
    expect(extractHtml('')).toBe('');
    expect(extractHtml('   \n  ')).toBe('');
  });

  it('lässt ein sauberes HTML-Dokument unverändert (bis auf Trim)', () => {
    const doc = '<!DOCTYPE html>\n<html><body>Hallo</body></html>';
    expect(extractHtml(`  ${doc}  `)).toBe(doc);
  });

  it('entfernt ```html-Code-Fences', () => {
    const doc = '<!DOCTYPE html><html><body>X</body></html>';
    const raw = '```html\n' + doc + '\n```';
    expect(extractHtml(raw)).toBe(doc);
  });

  it('entfernt schlichte ```-Fences', () => {
    const doc = '<!DOCTYPE html><html></html>';
    expect(extractHtml('```\n' + doc + '\n```')).toBe(doc);
  });

  it('schneidet erklärenden Text vor dem Dokument ab', () => {
    const doc = '<!DOCTYPE html><html><body>Y</body></html>';
    expect(extractHtml('Hier ist deine App:\n\n' + doc)).toBe(doc);
  });

  it('erkennt <html> auch ohne DOCTYPE', () => {
    const doc = '<html lang="de"><body>Z</body></html>';
    expect(extractHtml('Bla bla ' + doc)).toBe(doc);
  });

  it('lässt ``` INNERHALB des Dokuments unangetastet (z. B. Regex im <script>)', () => {
    const doc =
      '<!DOCTYPE html><html><head><title>Editor</title></head><body>' +
      '<script>const fence = line.match(/^```(.*)$/); if (fence) render();</script>' +
      '</body></html>';
    expect(extractHtml(doc)).toBe(doc);
  });

  it('schneidet erklärenden Text NACH dem Dokument ab', () => {
    const doc = '<!DOCTYPE html><html><body>Q</body></html>';
    expect(extractHtml(doc + '\n\nFertig! Viel Spaß.')).toBe(doc);
  });
});

describe('extractTitle', () => {
  it('liest den Titel aus dem Dokument', () => {
    const doc = '<!DOCTYPE html><html><head><title>Taschenrechner</title></head></html>';
    expect(extractTitle(doc)).toBe('Taschenrechner');
  });

  it('normalisiert Whitespace und trimmt', () => {
    expect(extractTitle('<title>\n  Mein   Editor \n</title>')).toBe('Mein Editor');
  });

  it('gibt leeren String zurück, wenn kein Titel vorhanden ist', () => {
    expect(extractTitle('<html><body>x</body></html>')).toBe('');
  });
});

describe('extractIcon', () => {
  it('liest das Icon aus dem morphos:icon-Meta', () => {
    const doc = '<meta name="morphos:icon" content="🧮">';
    expect(extractIcon(doc)).toBe('🧮');
  });

  it('funktioniert bei umgekehrter Attributreihenfolge', () => {
    const doc = '<meta content="📝" name="morphos:icon" />';
    expect(extractIcon(doc)).toBe('📝');
  });

  it('gibt leeren String zurück, wenn kein Icon-Meta vorhanden ist', () => {
    expect(extractIcon('<meta name="viewport" content="x">')).toBe('');
  });
});
