import { describe, it, expect } from 'vitest';
import { DEFAULT_FRAMEWORK, PREACT_LIB, detectFramework, resolveFramework } from './framework';
import { extractLibs, splitLibs } from './libs';
import { bundle } from './bundle';
import type { SourceFile } from '@/types';

const HTML = (head = ''): string =>
  `<!DOCTYPE html><html><head><title>App</title>${head}</head><body><div id="app"></div></body></html>`;

const PREACT_META = `<meta name="${PREACT_LIB}" content="x">`; // absichtlich falsch herum — darf NICHT greifen
const LIB_META = `<meta name="morphos:lib" content="${PREACT_LIB}">`;

const vanillaApp: SourceFile[] = [
  { path: 'src/index.html', content: HTML() },
  { path: 'src/app.js', content: 'document.body.textContent = "hi";' },
];
const preactApp: SourceFile[] = [
  { path: 'src/index.html', content: HTML(LIB_META) },
  { path: 'src/app.js', content: 'const { render } = preact;' },
];

describe('detectFramework', () => {
  it('erkennt Preact am morphos:lib-Metatag der Einstiegsdatei', () => {
    expect(detectFramework(preactApp)).toBe('preact');
  });

  it('hält eine App ohne dieses Metatag für vanilla', () => {
    expect(detectFramework(vanillaApp)).toBe('vanilla');
  });

  it('lässt sich von einem anderen Metatag nicht täuschen', () => {
    expect(detectFramework([{ path: 'src/index.html', content: HTML(PREACT_META) }])).toBe('vanilla');
  });

  it('übersieht das Metatag nicht wegen anderer Schreibweise', () => {
    const shouty = `<META NAME='morphos:lib' CONTENT='preact'>`;
    expect(detectFramework([{ path: 'src/index.html', content: HTML(shouty) }])).toBe('preact');
  });

  it('zählt eine andere Bibliothek nicht als Preact', () => {
    const other = '<meta name="morphos:lib" content="https://cdn.example.com/chart.js">';
    expect(detectFramework([{ path: 'src/index.html', content: HTML(other) }])).toBe('vanilla');
  });

  it('kommt ohne Einstiegsdatei aus', () => {
    expect(detectFramework([])).toBe('vanilla');
    expect(detectFramework([{ path: 'src/app.js', content: LIB_META }])).toBe('vanilla');
  });
});

describe('resolveFramework', () => {
  it('nimmt bei einer NEUEN App die Wahl aus dem Composer', () => {
    expect(resolveFramework([], 'preact')).toBe('preact');
    expect(resolveFramework([], 'vanilla')).toBe('vanilla');
  });

  it('bleibt ohne Wahl bei vanilla (die Vorgabe setzt die Oberfläche)', () => {
    expect(resolveFramework([], undefined)).toBe('vanilla');
  });

  it('liest bei einer BESTEHENDEN App ihren eigenen Stil aus den Quellen', () => {
    // Folgewünsche fragen nicht noch einmal — die App bringt ihre Wahl selbst mit.
    expect(resolveFramework(preactApp, 'vanilla')).toBe('preact');
    expect(resolveFramework(vanillaApp, 'preact')).toBe('vanilla');
    expect(resolveFramework(preactApp)).toBe('preact');
    expect(resolveFramework(vanillaApp)).toBe('vanilla');
  });
});

/*
 * Der Weg vom erzeugten Quelltext bis in das gebündelte Artefakt: Was die App
 * per Metatag anfordert, holt die Shell aus den eingebauten Bibliotheken
 * (electron/main liest sie aus node_modules) und bettet es beim Bündeln ein.
 */
describe('Auslieferung an die App', () => {
  const PREACT_CODE = '/* preact+hooks+htm */ window.preact = {};';

  it('bettet Preact in eine Preact-App ein — ohne Freigabeliste, ohne Netz', () => {
    const { builtin, external } = splitLibs(extractLibs(preactApp[0].content));
    expect(builtin).toEqual([PREACT_LIB]);
    expect(external).toEqual([]);

    const html = bundle(preactApp, { [PREACT_LIB]: PREACT_CODE });
    expect(html).toContain(PREACT_CODE);
    expect(html).toContain(`<script data-morphos-lib="${PREACT_LIB}">`);
    expect(html).not.toContain('<meta name="morphos:lib"');
  });

  it('bettet einer vanilla-App nichts ein', () => {
    expect(splitLibs(extractLibs(vanillaApp[0].content))).toEqual({ builtin: [], external: [] });

    // Selbst mit bereitliegendem Code bleibt das Artefakt frei davon.
    const html = bundle(vanillaApp, { [PREACT_LIB]: PREACT_CODE });
    expect(html).not.toContain(PREACT_CODE);
    expect(html).not.toMatch(/preact/i);
  });
});

describe('DEFAULT_FRAMEWORK', () => {
  it('ist Preact — eine neue App bekommt es, ohne dass man danach fragen muss', () => {
    expect(DEFAULT_FRAMEWORK).toBe('preact');
  });
});
