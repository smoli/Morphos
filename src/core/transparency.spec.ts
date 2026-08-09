import { describe, it, expect } from 'vitest';
import {
  cleanBlur,
  cleanBlurs,
  cleanTransparency,
  cleanTransparencies,
  DEFAULT_DOCK_BLUR,
  DEFAULT_DOCK_TRANSPARENCY,
  dockBackgroundCss,
  dockBlurCss,
  MAX_DOCK_BLUR,
  transparencyPercent,
} from './transparency';

describe('cleanTransparency', () => {
  it('nimmt einen Wert zwischen ganz deckend und ganz durchsichtig', () => {
    expect(cleanTransparency(0)).toBe(0);
    expect(cleanTransparency(0.4)).toBe(0.4);
    expect(cleanTransparency(1)).toBe(1);
  });

  it('rundet auf ganze Prozent — der Regler soll nichts Krummes ablegen', () => {
    expect(cleanTransparency(0.283)).toBe(0.28);
    expect(cleanTransparency(0.2857)).toBe(0.29);
  });

  it('lehnt ab, was kein Anteil ist', () => {
    expect(cleanTransparency(-0.1)).toBeNull();
    expect(cleanTransparency(1.5)).toBeNull();
    expect(cleanTransparency(Number.NaN)).toBeNull();
    expect(cleanTransparency(Number.POSITIVE_INFINITY)).toBeNull();
    expect(cleanTransparency('0.5')).toBeNull();
    expect(cleanTransparency(null)).toBeNull();
    expect(cleanTransparency(undefined)).toBeNull();
  });
});

describe('cleanTransparencies', () => {
  it('tütet die gemerkten Werte je Verzeichnis ein', () => {
    expect(cleanTransparencies({ '/apps': 0.5, '/andere': 0.123 })).toEqual({
      '/apps': 0.5,
      '/andere': 0.12,
    });
  });

  it('lässt beschädigte Einträge weg (dort gilt dann die Vorgabe)', () => {
    expect(cleanTransparencies({ '/apps': 'viel', '/b': 2, '/c': 0.3 })).toEqual({ '/c': 0.3 });
  });

  it('nimmt auch gar nichts an', () => {
    expect(cleanTransparencies(undefined)).toEqual({});
    expect(cleanTransparencies(null)).toEqual({});
    expect(cleanTransparencies('viel')).toEqual({});
  });
});

describe('dockBackgroundCss', () => {
  it('macht aus dem Anteil die Deckkraft der Leiste', () => {
    expect(dockBackgroundCss(0)).toBe('rgba(20, 22, 28, 1)');
    expect(dockBackgroundCss(0.25)).toBe('rgba(20, 22, 28, 0.75)');
    expect(dockBackgroundCss(1)).toBe('rgba(20, 22, 28, 0)');
  });

  it('nimmt ohne (oder mit unbrauchbarer) Angabe die Vorgabe', () => {
    const vorgabe = dockBackgroundCss(DEFAULT_DOCK_TRANSPARENCY);
    expect(dockBackgroundCss(undefined)).toBe(vorgabe);
    expect(dockBackgroundCss(null)).toBe(vorgabe);
    expect(dockBackgroundCss(7 as number)).toBe(vorgabe);
  });

  it('malt nie etwas anderes als eine Farbe (nichts Fremdes gerät in die CSS-Angabe)', () => {
    expect(dockBackgroundCss('red; background: url(x)' as never)).toBe(
      dockBackgroundCss(DEFAULT_DOCK_TRANSPARENCY),
    );
  });
});

describe('cleanBlur', () => {
  it('nimmt einen Schleier zwischen klar und dicht', () => {
    expect(cleanBlur(0)).toBe(0);
    expect(cleanBlur(14)).toBe(14);
    expect(cleanBlur(MAX_DOCK_BLUR)).toBe(MAX_DOCK_BLUR);
  });

  it('rundet auf ganze Bildpunkte — der Regler soll nichts Krummes ablegen', () => {
    expect(cleanBlur(8.4)).toBe(8);
    expect(cleanBlur(8.6)).toBe(9);
  });

  it('lehnt ab, was kein Schleier ist', () => {
    expect(cleanBlur(-1)).toBeNull();
    expect(cleanBlur(MAX_DOCK_BLUR + 1)).toBeNull();
    expect(cleanBlur(Number.NaN)).toBeNull();
    expect(cleanBlur(Number.POSITIVE_INFINITY)).toBeNull();
    expect(cleanBlur('14')).toBeNull();
    expect(cleanBlur(null)).toBeNull();
    expect(cleanBlur(undefined)).toBeNull();
  });
});

describe('cleanBlurs', () => {
  it('tütet die gemerkten Werte je Verzeichnis ein', () => {
    expect(cleanBlurs({ '/apps': 20, '/andere': 3.4 })).toEqual({ '/apps': 20, '/andere': 3 });
  });

  it('lässt beschädigte Einträge weg (dort gilt dann die Vorgabe)', () => {
    expect(cleanBlurs({ '/apps': 'dicht', '/b': 99, '/c': 6 })).toEqual({ '/c': 6 });
  });

  it('nimmt auch gar nichts an', () => {
    expect(cleanBlurs(undefined)).toEqual({});
    expect(cleanBlurs(null)).toEqual({});
    expect(cleanBlurs('dicht')).toEqual({});
  });
});

describe('dockBlurCss', () => {
  it('macht aus den Bildpunkten den Milchglas-Schleier', () => {
    expect(dockBlurCss(0)).toBe('blur(0px)');
    expect(dockBlurCss(14)).toBe('blur(14px)');
    expect(dockBlurCss(MAX_DOCK_BLUR)).toBe(`blur(${MAX_DOCK_BLUR}px)`);
  });

  it('nimmt ohne (oder mit unbrauchbarer) Angabe die Vorgabe', () => {
    const vorgabe = dockBlurCss(DEFAULT_DOCK_BLUR);
    expect(dockBlurCss(undefined)).toBe(vorgabe);
    expect(dockBlurCss(null)).toBe(vorgabe);
    expect(dockBlurCss(-3)).toBe(vorgabe);
  });

  it('malt nie etwas anderes als einen Schleier (nichts Fremdes gerät in die CSS-Angabe)', () => {
    expect(dockBlurCss('14px); background: url(x' as never)).toBe(dockBlurCss(DEFAULT_DOCK_BLUR));
  });
});

describe('transparencyPercent', () => {
  it('zeigt den Anteil als ganze Prozent', () => {
    expect(transparencyPercent(0)).toBe(0);
    expect(transparencyPercent(0.28)).toBe(28);
    expect(transparencyPercent(1)).toBe(100);
  });
});
