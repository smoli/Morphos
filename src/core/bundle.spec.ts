import { describe, it, expect } from 'vitest';
import { bundle } from './bundle';
import type { SourceFile } from '@/types';

function makeFiles(index: string, extra: SourceFile[] = []): SourceFile[] {
  return [{ path: 'src/index.html', content: index }, ...extra];
}

describe('bundle', () => {
  it('liefert leer, wenn src/index.html fehlt', () => {
    expect(bundle([{ path: 'src/app.js', content: 'x' }])).toBe('');
    expect(bundle([])).toBe('');
  });

  it('bettet verlinkte Stylesheets als <style> ein', () => {
    const html = '<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>';
    const out = bundle(makeFiles(html, [{ path: 'src/style.css', content: 'body{color:red}' }]));
    expect(out).toContain('<style>body{color:red}</style>');
    expect(out).not.toContain('<link');
  });

  it('bettet referenzierte Skripte inline ein', () => {
    const html = '<html><head></head><body><script src="app.js"></script></body></html>';
    const out = bundle(makeFiles(html, [{ path: 'src/app.js', content: 'const x = 1;' }]));
    expect(out).toContain('<script>const x = 1;</script>');
    expect(out).not.toContain('src="app.js"');
  });

  it('löst Pfade relativ zu src/ auf (auch ./ und Unterordner)', () => {
    const html =
      '<html><head><link rel="stylesheet" href="./ui/theme.css"></head><body><script src="ui/menu.js"></script></body></html>';
    const out = bundle(
      makeFiles(html, [
        { path: 'src/ui/theme.css', content: '.t{}' },
        { path: 'src/ui/menu.js', content: 'menu();' },
      ]),
    );
    expect(out).toContain('<style>.t{}</style>');
    expect(out).toContain('<script>menu();</script>');
  });

  it('lässt unbekannte Referenzen unangetastet', () => {
    const html =
      '<html><head><link rel="stylesheet" href="fehlt.css"></head><body><script src="https://cdn.example/x.js"></script></body></html>';
    const out = bundle(makeFiles(html));
    expect(out).toContain('href="fehlt.css"');
    expect(out).toContain('https://cdn.example/x.js');
  });

  it('ersetzt morphos:lib-Metatags durch den gecachten Bibliotheks-Code', () => {
    const url = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1';
    const html = `<html><head><meta name="morphos:lib" content="${url}"></head><body></body></html>`;
    const out = bundle(makeFiles(html), { [url]: 'var Chart = {};' });
    expect(out).toContain(`<script data-morphos-lib="${url}">var Chart = {};</script>`);
    expect(out).not.toContain('<meta name="morphos:lib"');
  });

  it('lässt lib-Metatags ohne Auflösung stehen', () => {
    const html = '<html><head><meta name="morphos:lib" content="https://x.example/a.js"></head></html>';
    const out = bundle(makeFiles(html));
    expect(out).toContain('morphos:lib');
  });

  it('entschärft </script> im eingebetteten Skript-Inhalt', () => {
    const html = '<html><body><script src="app.js"></script></body></html>';
    const out = bundle(makeFiles(html, [{ path: 'src/app.js', content: 'el.innerHTML = "</script>";' }]));
    expect(out).not.toContain('"</script>"');
    expect(out).toContain('<\\/script>');
  });

  it('lässt title/icon und übrigen Inhalt unverändert', () => {
    const html =
      '<html><head><title>App</title><meta name="morphos:icon" content="🎯"></head><body><h1>Hi</h1></body></html>';
    const out = bundle(makeFiles(html));
    expect(out).toContain('<title>App</title>');
    expect(out).toContain('morphos:icon');
    expect(out).toContain('<h1>Hi</h1>');
  });
});
