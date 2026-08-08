import { describe, it, expect } from 'vitest';
import {
  fitIconSize,
  iconImageBytes,
  isIconFileType,
  isImageIcon,
  MAX_ICON_BYTES,
  MAX_ICON_PX,
  normalizeEmojiIcon,
  validateIcon,
  validateIconImage,
} from './icon';

/** Ein data:-URI mit `bytes` Nutzdaten (die base64-Länge ergibt sich daraus). */
function pngOfBytes(bytes: number, mime = 'image/png'): string {
  const payload = Buffer.alloc(bytes, 1).toString('base64');
  return `data:${mime};base64,${payload}`;
}

describe('isImageIcon', () => {
  it('erkennt ein Bild-Icon am data:-URI', () => {
    expect(isImageIcon(pngOfBytes(10))).toBe(true);
    expect(isImageIcon('  data:image/png;base64,AAAA  ')).toBe(true);
  });

  it('hält jedes andere Icon für ein Emoji', () => {
    expect(isImageIcon('🧮')).toBe(false);
    expect(isImageIcon('')).toBe(false);
    expect(isImageIcon('https://example.com/x.png')).toBe(false);
  });
});

describe('normalizeEmojiIcon', () => {
  it('nimmt genau ein Zeichen und schneidet Beiwerk ab', () => {
    expect(normalizeEmojiIcon('  🧮  ')).toBe('🧮');
    expect(normalizeEmojiIcon('🧮🧩')).toBe('🧮');
    expect(normalizeEmojiIcon('A')).toBe('A');
  });

  it('hält zusammengesetzte Emoji zusammen (ZWJ, Hautton, Flagge)', () => {
    expect(normalizeEmojiIcon('👩‍💻')).toBe('👩‍💻');
    expect(normalizeEmojiIcon('👍🏽')).toBe('👍🏽');
    expect(normalizeEmojiIcon('🇩🇪')).toBe('🇩🇪');
  });

  it('weist Leeres und getarnte Bilder ab', () => {
    expect(normalizeEmojiIcon('')).toBeNull();
    expect(normalizeEmojiIcon('   ')).toBeNull();
    expect(normalizeEmojiIcon(pngOfBytes(10))).toBeNull();
  });
});

describe('fitIconSize', () => {
  it('verkleinert auf die längste Kante und wahrt das Seitenverhältnis', () => {
    expect(fitIconSize(512, 256)).toEqual({ width: MAX_ICON_PX, height: MAX_ICON_PX / 2 });
    expect(fitIconSize(256, 512)).toEqual({ width: MAX_ICON_PX / 2, height: MAX_ICON_PX });
  });

  it('vergrößert nie — kleine Bilder bleiben, wie sie sind', () => {
    expect(fitIconSize(40, 20)).toEqual({ width: 40, height: 20 });
  });

  it('fängt unbrauchbare Maße ab', () => {
    expect(fitIconSize(0, 0)).toEqual({ width: MAX_ICON_PX, height: MAX_ICON_PX });
    expect(fitIconSize(Number.NaN, 64)).toEqual({ width: MAX_ICON_PX, height: 64 });
  });
});

describe('iconImageBytes', () => {
  it('rechnet die base64-Nutzlast in Bytes zurück', () => {
    expect(iconImageBytes(pngOfBytes(3))).toBe(3);
    expect(iconImageBytes(pngOfBytes(4))).toBe(4);
    expect(iconImageBytes(pngOfBytes(5))).toBe(5);
    expect(iconImageBytes('🧮')).toBe(0);
  });
});

describe('validateIconImage', () => {
  it('nimmt ein kleines Rasterbild an', () => {
    expect(validateIconImage(pngOfBytes(1000))).toEqual({ ok: true });
    expect(validateIconImage(pngOfBytes(1000, 'image/webp'))).toEqual({ ok: true });
  });

  it('lehnt zu große Bilder ab', () => {
    const res = validateIconImage(pngOfBytes(MAX_ICON_BYTES + 1));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/zu groß/);
  });

  it('lehnt SVG ab — abgelegt wird nur gerastert (kein aktiver Inhalt)', () => {
    const res = validateIconImage(pngOfBytes(100, 'image/svg+xml'));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/nicht unterstützt/);
  });

  it('lehnt Nicht-Bilder und kaputte URIs ab', () => {
    expect(validateIconImage('data:text/html;base64,PHNjcmlwdD4=').ok).toBe(false);
    expect(validateIconImage('data:image/png,nichtbase64').ok).toBe(false);
    expect(validateIconImage('data:image/png;base64,').ok).toBe(false);
    expect(validateIconImage('🧮').ok).toBe(false);
  });
});

describe('validateIcon', () => {
  it('normalisiert ein Emoji', () => {
    expect(validateIcon(' 🧮x ')).toEqual({ ok: true, icon: '🧮' });
  });

  it('reicht ein gültiges Bild unverändert durch', () => {
    const uri = pngOfBytes(500);
    expect(validateIcon(` ${uri} `)).toEqual({ ok: true, icon: uri });
  });

  it('lehnt Leeres und ungültige Bilder ab', () => {
    expect(validateIcon('').ok).toBe(false);
    expect(validateIcon(pngOfBytes(MAX_ICON_BYTES + 1)).ok).toBe(false);
  });
});

describe('isIconFileType', () => {
  it('erlaubt gängige Bildformate als Quelle (SVG eingeschlossen)', () => {
    expect(isIconFileType('image/png')).toBe(true);
    expect(isIconFileType('image/svg+xml')).toBe(true);
    expect(isIconFileType('application/pdf')).toBe(false);
    expect(isIconFileType('')).toBe(false);
  });
});
