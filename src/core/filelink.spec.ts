import { describe, it, expect } from 'vitest';
import { FILE_SCHEME, fileUrl, parseFileUrl, parseRange, resolveFileRequest } from './filelink';

describe('fileUrl / parseFileUrl', () => {
  it('trägt Datenordner und Pfad unversehrt durch die URL', () => {
    const url = fileUrl('/Users/ich/Daten', 'bilder/urlaub 2026.png');
    expect(url.startsWith(`${FILE_SCHEME}://`)).toBe(true);
    expect(parseFileUrl(url)).toEqual({ root: '/Users/ich/Daten', path: 'bilder/urlaub 2026.png' });
  });

  it('kodiert Sonderzeichen, statt die URL zu zerlegen', () => {
    const url = fileUrl('/da ten&x', 'a?b=c#d/e f.png');
    expect(url).not.toContain(' ');
    expect(parseFileUrl(url)).toEqual({ root: '/da ten&x', path: 'a?b=c#d/e f.png' });
  });

  it('kommt mit Windows-Pfaden zurecht', () => {
    const url = fileUrl('C:\\Users\\ich\\Daten', 'bild.png');
    expect(parseFileUrl(url)?.root).toBe('C:\\Users\\ich\\Daten');
  });

  it('weist fremde Schemata und Unfug ab', () => {
    expect(parseFileUrl('file:///etc/passwd')).toBeNull();
    expect(parseFileUrl('https://example.com/?root=/x&path=y')).toBeNull();
    expect(parseFileUrl('kein-url')).toBeNull();
    expect(parseFileUrl(`${FILE_SCHEME}://datei/?path=y`)).toBeNull();
  });
});

describe('resolveFileRequest', () => {
  const approved = (root: string): boolean => root === '/daten';
  // Attrappe des eingegrenzten Auflösers (in echt: core/fsaccess resolveWithin).
  const resolve = (root: string, p: string): string | null => (p.includes('..') ? null : `${root}/${p}`);

  it('löst eine Anfrage im freigegebenen Datenordner auf', () => {
    expect(resolveFileRequest(fileUrl('/daten', 'bild.png'), approved, resolve)).toBe('/daten/bild.png');
  });

  it('verweigert einen nicht freigegebenen Datenordner', () => {
    expect(resolveFileRequest(fileUrl('/woanders', 'bild.png'), approved, resolve)).toBeNull();
  });

  it('verweigert den Ausbruch aus dem Datenordner', () => {
    expect(resolveFileRequest(fileUrl('/daten', '../../etc/passwd'), approved, resolve)).toBeNull();
  });

  it('verweigert alles, was keine gültige Datei-URL ist', () => {
    expect(resolveFileRequest('https://example.com/', approved, resolve)).toBeNull();
  });
});

describe('parseRange', () => {
  it('liest ein Stück aus der Mitte', () => {
    expect(parseRange('bytes=2-4', 10)).toEqual({ start: 2, end: 4 });
  });

  it('liest ab einer Stelle bis zum Ende', () => {
    expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 });
  });

  it('liest die letzten Bytes', () => {
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange('bytes=-99', 10)).toEqual({ start: 0, end: 9 });
  });

  it('kappt ein Ende hinter der Datei', () => {
    expect(parseRange('bytes=0-100', 10)).toEqual({ start: 0, end: 9 });
  });

  it('bedient das erste Stück einer mehrteiligen Anfrage', () => {
    expect(parseRange('bytes=0-1,5-6', 10)).toEqual({ start: 0, end: 1 });
  });

  it('lehnt ab, was sich nicht bedienen lässt', () => {
    expect(parseRange('bytes=20-', 10)).toBeNull();
    expect(parseRange('bytes=8-3', 10)).toBeNull();
    expect(parseRange('bytes=-0', 10)).toBeNull();
    expect(parseRange('bytes=-', 10)).toBeNull();
    expect(parseRange('items=0-4', 10)).toBeNull();
    expect(parseRange('', 10)).toBeNull();
    expect(parseRange('bytes=0-4', 0)).toBeNull();
  });
});
