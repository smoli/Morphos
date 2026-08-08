import { describe, it, expect } from 'vitest';
import {
  cleanWallpaper,
  cleanWallpapers,
  DEFAULT_WALLPAPER,
  MAX_WALLPAPER_BYTES,
  normalizeColor,
  sameWallpaper,
  validateWallpaperImage,
  wallpaperCss,
  WALLPAPER_PRESETS,
} from './wallpaper';
import type { Wallpaper } from '@/types';

/** Ein Bild-Hintergrund der gewünschten Größe (rohe Bytes → base64). */
function imageWallpaper(bytes = 900, mime = 'image/jpeg'): Wallpaper {
  return { kind: 'image', image: `data:${mime};base64,${Buffer.alloc(bytes, 7).toString('base64')}` };
}

describe('normalizeColor', () => {
  it('nimmt lange und kurze Schreibweise und vereinheitlicht sie', () => {
    expect(normalizeColor('#A1B2C3')).toBe('#a1b2c3');
    expect(normalizeColor('  #0f1  ')).toBe('#00ff11');
  });

  it('lehnt alles ab, was keine Farbe ist', () => {
    expect(normalizeColor('rot')).toBeNull();
    expect(normalizeColor('rgb(1,2,3)')).toBeNull();
    expect(normalizeColor('#12345')).toBeNull();
    expect(normalizeColor('')).toBeNull();
    // Keine Einfallstür in die CSS-Angabe.
    expect(normalizeColor('#fff; background: url(http://x)')).toBeNull();
  });
});

describe('cleanWallpaper', () => {
  it('nimmt eine Farbe an', () => {
    expect(cleanWallpaper({ kind: 'color', color: '#ABCDEF' })).toEqual({ kind: 'color', color: '#abcdef' });
  });

  it('nimmt einen Verlauf an und dreht den Winkel in den Kreis', () => {
    expect(cleanWallpaper({ kind: 'gradient', from: '#000', to: '#fff', angle: 380 })).toEqual({
      kind: 'gradient',
      from: '#000000',
      to: '#ffffff',
      angle: 20,
    });
    expect(cleanWallpaper({ kind: 'gradient', from: '#000', to: '#fff', angle: -90 })).toEqual({
      kind: 'gradient',
      from: '#000000',
      to: '#ffffff',
      angle: 270,
    });
  });

  it('ergänzt einen fehlenden Winkel mit der Vorgabe', () => {
    const clean = cleanWallpaper({ kind: 'gradient', from: '#000', to: '#fff' });
    expect(clean).toEqual({ kind: 'gradient', from: '#000000', to: '#ffffff', angle: 160 });
  });

  it('nimmt ein Bild an, das unter dem Deckel bleibt', () => {
    const wallpaper = imageWallpaper();
    expect(cleanWallpaper(wallpaper)).toEqual(wallpaper);
  });

  it('verwirft Unbrauchbares', () => {
    expect(cleanWallpaper(null)).toBeNull();
    expect(cleanWallpaper('#fff')).toBeNull();
    expect(cleanWallpaper({ kind: 'farbe', color: '#fff' })).toBeNull();
    expect(cleanWallpaper({ kind: 'color', color: 'blau' })).toBeNull();
    expect(cleanWallpaper({ kind: 'gradient', from: '#000', to: 'weiß', angle: 10 })).toBeNull();
    expect(cleanWallpaper({ kind: 'image', image: 'https://example.com/bild.png' })).toBeNull();
  });

  it('verwirft ein Bild über dem Deckel', () => {
    expect(cleanWallpaper(imageWallpaper(MAX_WALLPAPER_BYTES + 1))).toBeNull();
  });

  it('verwirft ein SVG als abgelegtes Bild (aktiver Inhalt)', () => {
    expect(cleanWallpaper(imageWallpaper(300, 'image/svg+xml'))).toBeNull();
  });
});

describe('cleanWallpapers', () => {
  it('behält die brauchbaren Einträge je Verzeichnis', () => {
    const clean = cleanWallpapers({
      '/a': { kind: 'color', color: '#123456' },
      '/b': { kind: 'color', color: 'grün' },
      '/c': 'nichts',
    });
    expect(clean).toEqual({ '/a': { kind: 'color', color: '#123456' } });
  });

  it('liefert bei Unsinn ein leeres Verzeichnis', () => {
    expect(cleanWallpapers(undefined)).toEqual({});
    expect(cleanWallpapers(42)).toEqual({});
  });
});

describe('wallpaperCss', () => {
  it('malt eine Farbe', () => {
    expect(wallpaperCss({ kind: 'color', color: '#123456' })).toBe('#123456');
  });

  it('malt einen Verlauf', () => {
    expect(wallpaperCss({ kind: 'gradient', from: '#000000', to: '#ffffff', angle: 160 })).toBe(
      'linear-gradient(160deg, #000000, #ffffff)',
    );
  });

  it('malt ein Bild deckend über die Fläche', () => {
    const wallpaper = imageWallpaper();
    const css = wallpaperCss(wallpaper);
    expect(css).toContain(`url("${(wallpaper as { image: string }).image}")`);
    expect(css).toContain('cover');
  });

  it('fällt ohne Hintergrund auf die Vorgabe zurück', () => {
    expect(wallpaperCss(null)).toBe(wallpaperCss(DEFAULT_WALLPAPER));
  });

  it('malt einen beschädigten Hintergrund nicht (Vorgabe statt fremder CSS-Angabe)', () => {
    expect(wallpaperCss({ kind: 'color', color: 'red; behind: me' } as unknown as Wallpaper)).toBe(
      wallpaperCss(DEFAULT_WALLPAPER),
    );
  });
});

describe('sameWallpaper', () => {
  it('erkennt denselben Hintergrund wieder', () => {
    expect(sameWallpaper({ kind: 'color', color: '#111111' }, { kind: 'color', color: '#111111' })).toBe(true);
    expect(sameWallpaper({ kind: 'color', color: '#111111' }, { kind: 'color', color: '#222222' })).toBe(false);
    expect(sameWallpaper(DEFAULT_WALLPAPER, { kind: 'color', color: '#111111' })).toBe(false);
    expect(sameWallpaper(null, DEFAULT_WALLPAPER)).toBe(false);
  });
});

describe('WALLPAPER_PRESETS', () => {
  it('bietet die Vorgabe als erste Auswahl an', () => {
    expect(WALLPAPER_PRESETS.length).toBeGreaterThan(1);
    expect(sameWallpaper(WALLPAPER_PRESETS[0].wallpaper, DEFAULT_WALLPAPER)).toBe(true);
  });

  it('besteht ausschließlich aus gültigen Hintergründen mit eigener Id', () => {
    const ids = new Set(WALLPAPER_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(WALLPAPER_PRESETS.length);
    for (const preset of WALLPAPER_PRESETS) {
      expect(cleanWallpaper(preset.wallpaper), preset.id).toEqual(preset.wallpaper);
      expect(preset.label.trim()).not.toBe('');
    }
  });
});

describe('validateWallpaperImage', () => {
  it('nimmt ein Rasterbild unter dem Deckel an', () => {
    expect(validateWallpaperImage((imageWallpaper() as { image: string }).image)).toEqual({ ok: true });
  });

  it('nennt den Grund, wenn das Bild zu groß ist', () => {
    const big = (imageWallpaper(MAX_WALLPAPER_BYTES + 1000) as { image: string }).image;
    const result = validateWallpaperImage(big);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/groß/);
  });

  it('lehnt Nicht-Bilder ab', () => {
    expect(validateWallpaperImage('data:text/html;base64,PGI+').ok).toBe(false);
    expect(validateWallpaperImage('nichts').ok).toBe(false);
  });
});
