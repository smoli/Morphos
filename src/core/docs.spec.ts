import { describe, it, expect } from 'vitest';
import { EMPTY_DOCS, isDocPath, toDocs } from './docs';

describe('isDocPath', () => {
  it('erkennt genau die beiden Dokumente im Wurzelverzeichnis', () => {
    expect(isDocPath('concept.md')).toBe(true);
    expect(isDocPath('userdocumentation.md')).toBe(true);
  });

  it('weist jeden anderen Pfad ab', () => {
    expect(isDocPath('README.md')).toBe(false);
    expect(isDocPath('app.json')).toBe(false);
    expect(isDocPath('src/concept.md')).toBe(false);
    expect(isDocPath('../concept.md')).toBe(false);
    expect(isDocPath('unterordner/concept.md')).toBe(false);
    expect(isDocPath('Concept.md')).toBe(false);
    expect(isDocPath('')).toBe(false);
  });
});

describe('toDocs', () => {
  it('nimmt nur Zeichenketten an und ergänzt Fehlendes leer', () => {
    expect(toDocs({ concept: 'k', userdoc: 'a' })).toEqual({ concept: 'k', userdoc: 'a' });
    expect(toDocs({ concept: 'k' })).toEqual({ concept: 'k', userdoc: '' });
    expect(toDocs({ concept: 42, userdoc: null })).toEqual(EMPTY_DOCS);
    expect(toDocs(undefined)).toEqual(EMPTY_DOCS);
    expect(toDocs('kaputt')).toEqual(EMPTY_DOCS);
  });
});
