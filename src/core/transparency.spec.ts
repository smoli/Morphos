import { describe, it, expect } from 'vitest';
import {
  cleanTransparency,
  cleanTransparencies,
  DEFAULT_DOCK_TRANSPARENCY,
  dockBackgroundCss,
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

describe('transparencyPercent', () => {
  it('zeigt den Anteil als ganze Prozent', () => {
    expect(transparencyPercent(0)).toBe(0);
    expect(transparencyPercent(0.28)).toBe(28);
    expect(transparencyPercent(1)).toBe(100);
  });
});
