import { describe, it, expect } from 'vitest';
import {
  capText,
  extensionOf,
  highlightJson,
  isStreamed,
  kindLabel,
  previewDocument,
  previewKind,
  prettyJson,
  streamMimeType,
  TEXT_LIMIT,
} from './preview';

describe('extensionOf', () => {
  it('liefert die Endung in Kleinbuchstaben, ohne Punkt', () => {
    expect(extensionOf('Bild.PNG')).toBe('png');
    expect(extensionOf('archiv.tar.gz')).toBe('gz');
  });

  it('kennt keine Endung bei Namen ohne Punkt und bei Punktdateien', () => {
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('')).toBe('');
  });
});

describe('previewKind', () => {
  it('erkennt Bilder, Video und Ton', () => {
    for (const n of ['a.png', 'a.JPG', 'a.jpeg', 'a.gif', 'a.webp', 'a.avif', 'a.bmp', 'a.ico']) {
      expect(previewKind(n)).toBe('image');
    }
    for (const n of ['a.mp4', 'a.webm', 'a.m4v', 'a.mov', 'a.ogv']) {
      expect(previewKind(n)).toBe('video');
    }
    for (const n of ['a.mp3', 'a.wav', 'a.ogg', 'a.oga', 'a.m4a', 'a.flac', 'a.aac']) {
      expect(previewKind(n)).toBe('audio');
    }
  });

  it('erkennt Markdown, JSON und schlichten Text', () => {
    expect(previewKind('notiz.md')).toBe('markdown');
    expect(previewKind('notiz.markdown')).toBe('markdown');
    expect(previewKind('daten.json')).toBe('json');
    for (const n of ['a.txt', 'a.log', 'a.csv', 'a.js', 'a.ts', 'a.css', 'a.yml', 'a.xml']) {
      expect(previewKind(n)).toBe('text');
    }
  });

  it('trennt aktive Dokumente von den übrigen', () => {
    expect(previewKind('seite.html')).toBe('html');
    expect(previewKind('seite.htm')).toBe('html');
    expect(previewKind('zeichnung.svg')).toBe('svg');
  });

  it('gilt sonst als nicht darstellbar', () => {
    expect(previewKind('archiv.zip')).toBe('unknown');
    expect(previewKind('programm.exe')).toBe('unknown');
    expect(previewKind('README')).toBe('unknown');
  });

  it('sagt, was gestreamt und was gelesen wird', () => {
    expect(isStreamed('image')).toBe(true);
    expect(isStreamed('video')).toBe(true);
    expect(isStreamed('audio')).toBe(true);
    // Alles Übrige geht durch den gewöhnlichen, eingegrenzten Lesezugriff.
    expect(isStreamed('svg')).toBe(false);
    expect(isStreamed('text')).toBe(false);
    expect(isStreamed('unknown')).toBe(false);
  });

  it('nennt den Medientyp für den Strom — und nur für Medien', () => {
    expect(streamMimeType('bild.PNG')).toBe('image/png');
    expect(streamMimeType('film.mp4')).toBe('video/mp4');
    expect(streamMimeType('ton.mp3')).toBe('audio/mpeg');
    // Aktives kommt nie über den Strom, also auch nicht mit seinem Typ.
    expect(streamMimeType('seite.html')).toBe('application/octet-stream');
    expect(streamMimeType('bild.svg')).toBe('application/octet-stream');
    expect(streamMimeType('archiv.zip')).toBe('application/octet-stream');
  });

  it('benennt jede Art für den Anwender', () => {
    expect(kindLabel('image')).toBeTruthy();
    expect(kindLabel('unknown')).toBeTruthy();
  });
});

describe('capText', () => {
  it('lässt kurze Inhalte unangetastet', () => {
    expect(capText('kurz', 10)).toEqual({ text: 'kurz', capped: false });
  });

  it('kappt lange Inhalte auf das Maß und meldet es', () => {
    const out = capText('x'.repeat(30), 10);
    expect(out.text).toHaveLength(10);
    expect(out.capped).toBe(true);
  });

  it('hat ein Maß, das zum Vorschau-Limit passt', () => {
    expect(TEXT_LIMIT).toBeGreaterThan(0);
    expect(capText('x'.repeat(TEXT_LIMIT + 1)).capped).toBe(true);
  });
});

describe('prettyJson', () => {
  it('rückt gültiges JSON ein', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('liefert null bei ungültigem JSON', () => {
    expect(prettyJson('{kaputt')).toBeNull();
    expect(prettyJson('')).toBeNull();
  });
});

describe('highlightJson', () => {
  it('zeichnet Schlüssel, Zeichenketten, Zahlen und Konstanten aus', () => {
    const html = highlightJson('{\n  "a": "text",\n  "b": 42,\n  "c": true,\n  "d": null\n}');
    expect(html).toContain('class="jv-key"');
    expect(html).toContain('class="jv-str"');
    expect(html).toContain('class="jv-num"');
    expect(html).toContain('class="jv-bool"');
    expect(html).toContain('class="jv-null"');
  });

  it('escapt den gesamten Inhalt — aus JSON entkommt kein Markup', () => {
    const html = highlightJson(prettyJson('{"a":"<script>alert(1)</script>","<b>":2}')!);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;');
  });

  it('lässt Doppelpunkte in Zeichenketten nicht als Schlüssel durchgehen', () => {
    const html = highlightJson('{\n  "a": "x: y"\n}');
    expect(html.match(/jv-key/g)).toHaveLength(1);
  });
});

describe('previewDocument', () => {
  it('legt jedem HTML-Dokument die Content-Security-Policy in den Kopf', () => {
    const doc = previewDocument('<html><head><title>x</title></head><body>Hallo</body></html>', 'html');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('Hallo');
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<title>'));
  });

  it('bringt auch ein Dokument ohne Kopf unter die Policy', () => {
    const doc = previewDocument('<p>nur ein Schnipsel</p>', 'html');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<p>'));
  });

  it('bettet SVG als eigenes Dokument ein', () => {
    const doc = previewDocument('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>', 'svg');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('<rect />');
    expect(doc).toContain('<html');
  });

  it('schneidet nichts heraus — die Isolation macht die Sandbox, nicht das Filtern', () => {
    const doc = previewDocument('<html><body><script>1</script></body></html>', 'html');
    expect(doc).toContain('<script>1</script>');
  });
});
