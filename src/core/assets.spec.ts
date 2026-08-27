import { describe, it, expect } from 'vitest';
import {
  ASSETS_DIR,
  MAX_ASSET_NAME_LENGTH,
  assetMime,
  assetName,
  assetPath,
  isAssetPath,
  sanitizeAssetName,
  uniqueAssetName,
} from './assets';

describe('assetPath / assetName / isAssetPath', () => {
  it('führt Assets unter assets/ im Wurzelverzeichnis der App', () => {
    expect(ASSETS_DIR).toBe('assets');
    expect(assetPath('logo.png')).toBe('assets/logo.png');
  });

  it('nimmt einen Namen mit und ohne Ordner entgegen', () => {
    expect(assetName('assets/logo.png')).toBe('logo.png');
    expect(assetName('logo.png')).toBe('logo.png');
  });

  it('erkennt gültige Asset-Pfade — und weist alles andere ab', () => {
    expect(isAssetPath('assets/logo.png')).toBe(true);
    expect(isAssetPath('assets/schrift.woff2')).toBe(true);

    expect(isAssetPath('src/index.html')).toBe(false);
    expect(isAssetPath('assets/')).toBe(false);
    expect(isAssetPath('assets/unter/logo.png')).toBe(false);
    expect(isAssetPath('assets/../app.json')).toBe(false);
    expect(isAssetPath('assets/.git')).toBe(false);
    expect(isAssetPath('/assets/logo.png')).toBe(false);
    expect(isAssetPath('')).toBe(false);
  });

  it('liefert für einen unbrauchbaren Namen keinen Pfad', () => {
    expect(assetName('assets/unter/logo.png')).toBe('');
    expect(assetName('..')).toBe('');
  });
});

describe('sanitizeAssetName', () => {
  it('lässt einen brauchbaren Namen unangetastet', () => {
    expect(sanitizeAssetName('Logo-2.png')).toBe('Logo-2.png');
  });

  it('nimmt nur den Dateinamen, nie den Pfad davor', () => {
    expect(sanitizeAssetName('/tmp/bilder/logo.png')).toBe('logo.png');
    expect(sanitizeAssetName('C:\\Bilder\\logo.png')).toBe('logo.png');
    expect(sanitizeAssetName('../../app.json')).toBe('app.json');
  });

  it('ersetzt Zeichen, die im Dateinamen nichts verloren haben', () => {
    expect(sanitizeAssetName('mein bild (1).png')).toBe('mein-bild-1.png');
    expect(sanitizeAssetName('a\u0000b?.png')).toBe('a-b.png');
  });

  it('legt keine versteckten Dateien an', () => {
    expect(sanitizeAssetName('.gitignore')).toBe('gitignore');
    expect(sanitizeAssetName('...')).toBe('asset');
  });

  it('macht aus einem leeren Namen einen brauchbaren', () => {
    expect(sanitizeAssetName('')).toBe('asset');
    expect(sanitizeAssetName('   ')).toBe('asset');
    expect(sanitizeAssetName('???')).toBe('asset');
  });

  it('kürzt einen überlangen Namen und behält dabei die Endung', () => {
    const name = sanitizeAssetName(`${'x'.repeat(300)}.png`);
    expect(name.length).toBeLessThanOrEqual(MAX_ASSET_NAME_LENGTH);
    expect(name.endsWith('.png')).toBe(true);
  });

  it('bleibt auch bei einer überlangen ENDUNG im Rahmen', () => {
    const name = sanitizeAssetName(`a.${'b'.repeat(100)}`);
    expect(name.length).toBeLessThanOrEqual(MAX_ASSET_NAME_LENGTH);
    expect(isAssetPath(assetPath(name))).toBe(true);
  });

  it('liefert stets einen Namen, der auch wieder gelesen werden kann', () => {
    for (const raw of ['logo.png', `${'x'.repeat(300)}.png`, `a.${'b'.repeat(100)}`, '.'.repeat(90), 'ä'.repeat(200)]) {
      const name = sanitizeAssetName(raw);
      expect(isAssetPath(assetPath(name))).toBe(true);
    }
  });
});

describe('uniqueAssetName', () => {
  it('lässt einen freien Namen, wie er ist', () => {
    expect(uniqueAssetName('logo.png', ['bild.png'])).toBe('logo.png');
  });

  it('zählt einen belegten Namen hoch, statt zu überschreiben', () => {
    expect(uniqueAssetName('logo.png', ['logo.png'])).toBe('logo-2.png');
    expect(uniqueAssetName('logo.png', ['logo.png', 'logo-2.png'])).toBe('logo-3.png');
  });

  it('achtet nicht auf Groß- und Kleinschreibung (macOS, Windows)', () => {
    expect(uniqueAssetName('Logo.PNG', ['logo.png'])).toBe('Logo-2.PNG');
  });

  it('kommt auch ohne Endung zurecht', () => {
    expect(uniqueAssetName('daten', ['daten'])).toBe('daten-2');
  });

  it('sprengt mit der Zählung nicht die Namenslänge — sonst wäre der Name unlesbar', () => {
    const long = sanitizeAssetName(`${'x'.repeat(300)}.png`);
    expect(long.length).toBe(MAX_ASSET_NAME_LENGTH);

    const second = uniqueAssetName(long, [long]);
    expect(second).not.toBe(long);
    expect(second.length).toBeLessThanOrEqual(MAX_ASSET_NAME_LENGTH);
    expect(isAssetPath(assetPath(second))).toBe(true);
    expect(second.endsWith('.png')).toBe(true);

    const third = uniqueAssetName(long, [long, second]);
    expect([long, second]).not.toContain(third);
    expect(isAssetPath(assetPath(third))).toBe(true);
  });

  it('zählt auch bei langen Namen weiter, ohne je zweimal dasselbe zu liefern', () => {
    const taken = [sanitizeAssetName(`${'x'.repeat(300)}.png`)];
    for (let i = 0; i < 12; i += 1) {
      const next = uniqueAssetName(taken[0], taken);
      expect(taken).not.toContain(next);
      expect(next.length).toBeLessThanOrEqual(MAX_ASSET_NAME_LENGTH);
      taken.push(next);
    }
  });
});

describe('assetMime', () => {
  it('kennt Bilder, Schriften und Datendateien', () => {
    expect(assetMime('logo.png')).toBe('image/png');
    expect(assetMime('foto.JPG')).toBe('image/jpeg');
    expect(assetMime('zeichnung.svg')).toBe('image/svg+xml');
    expect(assetMime('schrift.woff2')).toBe('font/woff2');
    expect(assetMime('daten.json')).toBe('application/json');
    expect(assetMime('tabelle.csv')).toBe('text/csv');
  });

  it('nimmt den Pfad ebenso wie den bloßen Namen', () => {
    expect(assetMime('assets/logo.png')).toBe('image/png');
  });

  it('gibt Unbekanntem den allgemeinen Typ', () => {
    expect(assetMime('irgendwas.xyz')).toBe('application/octet-stream');
    expect(assetMime('ohneendung')).toBe('application/octet-stream');
  });
});
