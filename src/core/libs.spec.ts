import { describe, it, expect } from 'vitest';
import { extractLibs, matchesWhitelist } from './libs';

describe('extractLibs', () => {
  it('liest alle morphos:lib-Metatags', () => {
    const html =
      '<html><head>' +
      '<meta name="morphos:lib" content="https://cdn.jsdelivr.net/npm/chart.js@4.4.1">' +
      '<meta content="https://unpkg.com/dayjs@1.11.10/dayjs.min.js" name="morphos:lib">' +
      '<meta name="morphos:icon" content="🎯">' +
      '</head></html>';
    expect(extractLibs(html)).toEqual([
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.1',
      'https://unpkg.com/dayjs@1.11.10/dayjs.min.js',
    ]);
  });

  it('dedupliziert und liefert leer ohne Tags', () => {
    const html =
      '<html><head>' +
      '<meta name="morphos:lib" content="https://a.example/x.js">' +
      '<meta name="morphos:lib" content="https://a.example/x.js">' +
      '</head></html>';
    expect(extractLibs(html)).toEqual(['https://a.example/x.js']);
    expect(extractLibs('<html></html>')).toEqual([]);
  });
});

describe('matchesWhitelist', () => {
  it('vergleicht Hostnamen exakt (inkl. Subdomains des Musters)', () => {
    expect(matchesWhitelist('https://cdn.jsdelivr.net/npm/x.js', ['cdn.jsdelivr.net'])).toBe(true);
    expect(matchesWhitelist('https://fastly.cdn.jsdelivr.net/npm/x.js', ['cdn.jsdelivr.net'])).toBe(true);
    expect(matchesWhitelist('https://cdn.jsdelivr.net.evil.com/x.js', ['cdn.jsdelivr.net'])).toBe(false);
    expect(matchesWhitelist('https://evilcdn.jsdelivr.net.example/x.js', ['cdn.jsdelivr.net'])).toBe(false);
  });

  it('unterstützt URL-Präfix-Muster mit Host- und Pfadvergleich', () => {
    const patterns = ['https://cdn.jsdelivr.net/npm/'];
    expect(matchesWhitelist('https://cdn.jsdelivr.net/npm/chart.js@4', patterns)).toBe(true);
    expect(matchesWhitelist('https://cdn.jsdelivr.net/gh/evil/repo.js', patterns)).toBe(false);
    expect(matchesWhitelist('https://andere.example/npm/chart.js', patterns)).toBe(false);
  });

  it('verlangt https', () => {
    expect(matchesWhitelist('http://cdn.jsdelivr.net/npm/x.js', ['cdn.jsdelivr.net'])).toBe(false);
    expect(matchesWhitelist('file:///etc/passwd', ['cdn.jsdelivr.net'])).toBe(false);
  });

  it('lehnt bei leerer Liste oder unbrauchbarer URL ab', () => {
    expect(matchesWhitelist('https://cdn.jsdelivr.net/x.js', [])).toBe(false);
    expect(matchesWhitelist('kaputt', ['cdn.jsdelivr.net'])).toBe(false);
  });
});
