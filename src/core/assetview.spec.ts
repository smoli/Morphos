import { describe, it, expect } from 'vitest';
import {
  ASSET_TEXT_LIMIT,
  assetDataUri,
  assetIcon,
  assetText,
  assetTypeLabel,
  assetUsers,
  assetView,
  base64FromDataUri,
} from './assetview';
import { UNKNOWN_MIME } from './assets';
import type { SourceFile } from '@/types';

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

describe('assetView', () => {
  it('ordnet jeden Medientyp einer Darstellung zu', () => {
    expect(assetView('image/png')).toBe('image');
    expect(assetView('image/svg+xml')).toBe('image');
    expect(assetView('font/woff2')).toBe('font');
    expect(assetView('audio/mpeg')).toBe('audio');
    expect(assetView('video/mp4')).toBe('video');
    expect(assetView('application/json')).toBe('text');
    expect(assetView('application/xml')).toBe('text');
    expect(assetView('text/csv')).toBe('text');
  });

  it('zeigt alles Übrige als schlichte Datei — auch das Unbekannte', () => {
    expect(assetView('application/pdf')).toBe('file');
    expect(assetView(UNKNOWN_MIME)).toBe('file');
    expect(assetView('')).toBe('file');
  });
});

describe('assetIcon', () => {
  it('gibt jeder Art ihr Zeichen', () => {
    expect(assetIcon('image/png')).toBe('🖼');
    expect(assetIcon('font/woff2')).toBe('🔤');
    expect(assetIcon('audio/mpeg')).toBe('🎵');
    expect(assetIcon('video/mp4')).toBe('🎬');
    expect(assetIcon('application/json')).toBe('📄');
    expect(assetIcon(UNKNOWN_MIME)).toBe('📦');
  });
});

describe('assetTypeLabel', () => {
  it('nennt Art und Format — die Art aus dem Medientyp, das Format aus der Endung', () => {
    expect(assetTypeLabel({ name: 'logo.png', mime: 'image/png' })).toBe('Bild · PNG');
    expect(assetTypeLabel({ name: 'schrift.woff2', mime: 'font/woff2' })).toBe('Schrift · WOFF2');
    expect(assetTypeLabel({ name: 'daten.json', mime: 'application/json' })).toBe('Daten · JSON');
    expect(assetTypeLabel({ name: 'ton.mp3', mime: 'audio/mpeg' })).toBe('Ton · MP3');
    expect(assetTypeLabel({ name: 'film.mp4', mime: 'video/mp4' })).toBe('Video · MP4');
    expect(assetTypeLabel({ name: 'heft.pdf', mime: 'application/pdf' })).toBe('Datei · PDF');
  });

  it('bleibt bei der bloßen Art, wo es keine Endung gibt', () => {
    expect(assetTypeLabel({ name: 'liesmich', mime: UNKNOWN_MIME })).toBe('Datei');
  });
});

describe('assetDataUri', () => {
  it('baut die data:-URI, aus der die Vorschau lebt', () => {
    expect(assetDataUri('image/png', 'AAEC')).toBe('data:image/png;base64,AAEC');
  });

  it('gibt nichts heraus, wo Typ oder Inhalt fehlen — eine halbe URI zeigt nichts', () => {
    expect(assetDataUri('image/png', '')).toBe('');
    expect(assetDataUri('', 'AAEC')).toBe('');
  });
});

describe('base64FromDataUri', () => {
  it('schält den Inhalt aus dem, was der FileReader liefert', () => {
    expect(base64FromDataUri('data:image/png;base64,AAEC')).toBe('AAEC');
  });

  it('nimmt nichts an, was keine base64-URI ist', () => {
    expect(base64FromDataUri('data:image/png,roh')).toBe('');
    expect(base64FromDataUri('/pfad/logo.png')).toBe('');
    expect(base64FromDataUri('')).toBe('');
  });
});

describe('assetText', () => {
  it('macht aus base64 wieder den Text — samt Umlauten', () => {
    expect(assetText(b64('{ "größe": 3 }'))).toEqual({ text: '{ "größe": 3 }', capped: false });
  });

  it('kappt, was zu lang ist, und sagt es', () => {
    const long = 'x'.repeat(50);
    const { text, capped } = assetText(b64(long), 10);
    expect(text).toBe('x'.repeat(10));
    expect(capped).toBe(true);
  });

  it('liest bei sehr langem Inhalt gar nicht erst alles ein', () => {
    // Doppelt so viel wie das Maß: Entschlüsselt wird nur der Anfang.
    const { text, capped } = assetText(b64('y'.repeat(ASSET_TEXT_LIMIT * 2)));
    expect(text).toHaveLength(ASSET_TEXT_LIMIT);
    expect(capped).toBe(true);
  });

  it('bleibt bei Unlesbarem stumm, statt zu werfen', () => {
    expect(assetText('!!!kein base64!!!')).toEqual({ text: '', capped: false });
    expect(assetText('')).toEqual({ text: '', capped: false });
  });
});

describe('assetUsers', () => {
  const FILES: SourceFile[] = [
    { path: 'src/index.html', content: '<img src="assets/logo.png">' },
    { path: 'src/app.css', content: '@font-face { src: url(assets/schrift.woff2); }' },
    { path: 'src/app.js', content: 'const x = 1;' },
  ];

  it('nennt die Dateien, die dieses Asset verwenden', () => {
    expect(assetUsers(FILES, 'assets/logo.png')).toEqual(['src/index.html']);
    expect(assetUsers(FILES, 'schrift.woff2')).toEqual(['src/app.css']);
  });

  it('findet nichts, wo nichts steht', () => {
    expect(assetUsers(FILES, 'assets/unbenutzt.png')).toEqual([]);
    expect(assetUsers([], 'assets/logo.png')).toEqual([]);
  });

  it('verwechselt nicht, was nur ähnlich heißt', () => {
    const files: SourceFile[] = [{ path: 'src/index.html', content: '<img src="assets/meinlogo.png">' }];
    expect(assetUsers(files, 'logo.png')).toEqual([]);
  });

  it('nimmt keinen Pfad an, der keiner ist — sonst fände ein leerer Name jede Datei', () => {
    expect(assetUsers(FILES, '')).toEqual([]);
    expect(assetUsers(FILES, 'assets/../src/app.js')).toEqual([]);
  });
});
