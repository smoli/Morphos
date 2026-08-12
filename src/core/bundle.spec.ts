import { describe, it, expect } from 'vitest';
import { annotateSource, bundle } from './bundle';
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
    // Der Rumpf trägt zusätzlich seinen Quellort (annotateSource) — sein Inhalt bleibt.
    expect(out).toContain('Hi</h1>');
  });
});

describe('annotateSource', () => {
  it('gibt jedem Element im Rumpf seinen Quellort (Datei:Zeile:Spalte)', () => {
    const html = '<html>\n<body>\n  <h1>Hi</h1>\n</body>\n</html>';
    const out = annotateSource(html, 'src/index.html');
    expect(out).toContain('<h1 data-morphos-src="src/index.html:3:3">Hi</h1>');
    expect(out).toContain('<body data-morphos-src="src/index.html:2:1">');
  });

  it('lässt Kopf und Metadaten in Ruhe (dort ist nichts anzuklicken)', () => {
    const html = '<html><head><meta charset="utf-8"><title>App</title><link rel="stylesheet" href="a.css"></head><body></body></html>';
    const out = annotateSource(html, 'src/index.html');
    expect(out).toContain('<meta charset="utf-8">');
    expect(out).toContain('<title>App</title>');
    expect(out).toContain('<link rel="stylesheet" href="a.css">');
    expect(out).not.toContain('<html data-morphos-src');
  });

  it('rührt Markup in Skripten und Styles nicht an (htm-Templates, CSS)', () => {
    const html = '<body>\n<script>render(html`<div class="x">a</div>`)</script>\n<style>div{color:red}</style>\n</body>';
    const out = annotateSource(html, 'src/index.html');
    expect(out).toContain('html`<div class="x">a</div>`');
    expect(out).toContain('<style>div{color:red}</style>');
  });

  it('geht an Kommentaren und an < in Attributwerten vorbei', () => {
    const html = '<body><!-- <div>alt</div> --><p title="a<b">x</p></body>';
    const out = annotateSource(html, 'src/index.html');
    expect(out).toContain('<!-- <div>alt</div> -->');
    expect(out).toContain('<p data-morphos-src="src/index.html:1:30" title="a<b">');
  });

  it('markiert nicht doppelt und lässt leeres HTML in Ruhe', () => {
    const html = '<body><p>x</p></body>';
    const once = annotateSource(html, 'src/index.html');
    expect(annotateSource(once, 'src/index.html')).toBe(once);
    expect(annotateSource('', 'src/index.html')).toBe('');
  });

  it('zählt Zeilen und Spalten ab eins', () => {
    const out = annotateSource('<body>\n\n<div><span>x</span></div>\n</body>', 'src/index.html');
    expect(out).toContain('<div data-morphos-src="src/index.html:3:1">');
    expect(out).toContain('<span data-morphos-src="src/index.html:3:6">');
  });
});

describe('bundle — Quellorte', () => {
  it('gibt dem gebündelten Dokument die Quellorte von src/index.html mit', () => {
    const html = '<html><head></head><body>\n<button class="go">Los</button>\n</body></html>';
    const out = bundle(makeFiles(html));
    expect(out).toContain('<button data-morphos-src="src/index.html:2:1" class="go">');
  });

  it('markiert eingebettete Skripte nicht — deren Markup entsteht erst zur Laufzeit', () => {
    const html = '<html><body><div id="app"></div><script src="app.js"></script></body></html>';
    const out = bundle(makeFiles(html, [{ path: 'src/app.js', content: 'el.innerHTML = "<span>x</span>";' }]));
    expect(out).toContain('"<span>x</span>"');
    expect(out).toContain('<div data-morphos-src=');
  });
});
