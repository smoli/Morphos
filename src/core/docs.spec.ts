import { describe, it, expect } from 'vitest';
import {
  applyDocs,
  CONCEPT_FILE,
  EMPTY_DOCS,
  hasDocChanges,
  isDocPath,
  splitDocs,
  toDocs,
  USERDOC_FILE,
} from './docs';
import { applyChanges, parseLLMOutput } from './files';
import { bundle } from './bundle';
import type { SourceFile } from '@/types';

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

describe('splitDocs', () => {
  const files: SourceFile[] = [
    { path: 'src/index.html', content: '<html></html>' },
    { path: CONCEPT_FILE, content: '# Konzept' },
    { path: 'src/app.js', content: 'x();' },
    { path: USERDOC_FILE, content: '# Anleitung' },
  ];

  it('trennt die Dokumente vom Quelldatei-Satz', () => {
    const { sources, docs } = splitDocs(files);
    expect(sources.map((f) => f.path)).toEqual(['src/index.html', 'src/app.js']);
    expect(docs).toEqual({ concept: '# Konzept', userdoc: '# Anleitung' });
  });

  it('lässt den Eingabesatz unangetastet', () => {
    splitDocs(files);
    expect(files).toHaveLength(4);
  });

  it('liefert ohne Dokumente einen leeren Änderungssatz', () => {
    const { sources, docs } = splitDocs([{ path: 'src/index.html', content: 'x' }]);
    expect(sources).toHaveLength(1);
    expect(docs).toEqual({});
    expect(hasDocChanges(docs)).toBe(false);
  });

  it('erkennt auch ein einzeln geliefertes Dokument als Änderung', () => {
    const { docs } = splitDocs([{ path: CONCEPT_FILE, content: 'neu' }]);
    expect(docs).toEqual({ concept: 'neu' });
    expect(hasDocChanges(docs)).toBe(true);
  });
});

describe('applyDocs', () => {
  const current = { concept: 'alt-k', userdoc: 'alt-a' };

  it('übernimmt nur die genannten Dokumente', () => {
    expect(applyDocs(current, { concept: 'neu-k' })).toEqual({ concept: 'neu-k', userdoc: 'alt-a' });
    expect(applyDocs(current, {})).toEqual(current);
  });

  it('erlaubt das Leeren eines Dokuments nicht versehentlich (leerer String zählt)', () => {
    expect(applyDocs(current, { userdoc: '' })).toEqual({ concept: 'alt-k', userdoc: '' });
  });
});

describe('Dokumente im Weg einer Generierung', () => {
  it('landen neben der App — nicht im Quelldatei-Satz und nicht im Artefakt', () => {
    const raw = [
      '===MORPHOS:FILE src/index.html===',
      '<html><head><title>Rechner</title></head><body>ok</body></html>',
      '===MORPHOS:END===',
      `===MORPHOS:FILE ${CONCEPT_FILE}===`,
      '# Konzept',
      '===MORPHOS:END===',
      `===MORPHOS:FILE ${USERDOC_FILE}===`,
      '# Anleitung',
      '===MORPHOS:END===',
    ].join('\n');

    const changes = parseLLMOutput(raw);
    const { sources, docs } = splitDocs(changes.files);
    const files = applyChanges([], { ...changes, files: sources });

    expect(files.map((f) => f.path)).toEqual(['src/index.html']);
    expect(applyDocs(EMPTY_DOCS, docs)).toEqual({ concept: '# Konzept', userdoc: '# Anleitung' });

    const html = bundle(files);
    expect(html).toContain('Rechner');
    expect(html).not.toContain('# Konzept');
    expect(html).not.toContain('# Anleitung');
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
