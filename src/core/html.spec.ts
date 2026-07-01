import { describe, it, expect } from 'vitest';
import { extractHtml } from './html';

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
});
