import { describe, it, expect } from 'vitest';
import {
  cleanSessions,
  MAX_SESSION_WINDOWS,
  restorableSession,
  sameSession,
  serializeSession,
  type OpenWindow,
} from './session';

/** Ein offenes Fenster, wie es der Desktop-Store hält. */
function win(over: Partial<OpenWindow> = {}): OpenWindow {
  return {
    appId: 'a-1',
    x: 40,
    y: 40,
    w: 720,
    h: 520,
    z: 1,
    minimized: false,
    maximized: false,
    ...over,
  };
}

describe('serializeSession', () => {
  it('merkt Geometrie und Zustand eines Fensters', () => {
    expect(serializeSession([win({ appId: 'a-1', x: 120, y: 80, w: 640, h: 400, maximized: true })])).toEqual([
      { appId: 'a-1', x: 120, y: 80, w: 640, h: 400, minimized: false, maximized: true },
    ]);
  });

  it('reiht die Fenster von hinten nach vorn (zuletzt fokussiertes zuletzt)', () => {
    const session = serializeSession([
      win({ appId: 'a-1', z: 3 }),
      win({ appId: 'b-2', z: 7 }),
      win({ appId: 'c-3', z: 5 }),
    ]);
    expect(session.map((s) => s.appId)).toEqual(['a-1', 'c-3', 'b-2']);
  });

  it('lässt ungespeicherte Entwürfe weg — es gibt nichts zu laden', () => {
    expect(serializeSession([win({ appId: null }), win({ appId: 'a-1' })]).map((s) => s.appId)).toEqual(['a-1']);
  });

  it('rundet die Geometrie auf ganze Bildpunkte', () => {
    const [entry] = serializeSession([win({ x: 12.4, y: 7.6, w: 300.5, h: 200.2 })]);
    expect(entry).toMatchObject({ x: 12, y: 8, w: 301, h: 200 });
  });

  it('behält von zwei Fenstern derselben App nur das vordere', () => {
    const session = serializeSession([win({ appId: 'a-1', z: 1, x: 10 }), win({ appId: 'a-1', z: 9, x: 99 })]);
    expect(session).toHaveLength(1);
    expect(session[0].x).toBe(99);
  });

  it('merkt sich höchstens MAX_SESSION_WINDOWS Fenster (die vordersten)', () => {
    const many = Array.from({ length: MAX_SESSION_WINDOWS + 3 }, (_, i) => win({ appId: `a-${i}`, z: i }));
    const session = serializeSession(many);
    expect(session).toHaveLength(MAX_SESSION_WINDOWS);
    // Das vorderste Fenster steht am Ende und ist erhalten geblieben.
    expect(session[session.length - 1].appId).toBe(`a-${MAX_SESSION_WINDOWS + 2}`);
  });

  it('liefert für einen leeren Desktop eine leere Sitzung', () => {
    expect(serializeSession([])).toEqual([]);
  });
});

describe('restorableSession', () => {
  const saved = serializeSession([
    win({ appId: 'a-1', z: 1 }),
    win({ appId: 'weg-9', z: 2 }),
    win({ appId: 'b-2', z: 3 }),
  ]);

  it('überspringt Fenster, deren App es nicht mehr gibt', () => {
    expect(restorableSession(saved, ['a-1', 'b-2']).map((s) => s.appId)).toEqual(['a-1', 'b-2']);
  });

  it('behält die Stapelreihenfolge der übrigen Fenster', () => {
    expect(restorableSession(saved, ['b-2', 'a-1', 'weg-9']).map((s) => s.appId)).toEqual(['a-1', 'weg-9', 'b-2']);
  });

  it('liefert ohne bekannte Apps nichts (erster Start)', () => {
    expect(restorableSession(saved, [])).toEqual([]);
  });

  it('öffnet dieselbe App nicht doppelt', () => {
    const doppelt = [...saved, saved[0]];
    expect(restorableSession(doppelt, ['a-1', 'b-2']).map((s) => s.appId)).toEqual(['a-1', 'b-2']);
  });
});

describe('sameSession', () => {
  const a = serializeSession([win({ appId: 'a-1', z: 1 }), win({ appId: 'b-2', z: 2 })]);

  it('erkennt eine unveränderte Sitzung', () => {
    expect(sameSession(a, serializeSession([win({ appId: 'a-1', z: 1 }), win({ appId: 'b-2', z: 2 })]))).toBe(true);
  });

  it('erkennt eine andere Reihenfolge', () => {
    expect(sameSession(a, [a[1], a[0]])).toBe(false);
  });

  it('erkennt geänderte Geometrie und Zustand', () => {
    expect(sameSession(a, [{ ...a[0], x: 999 }, a[1]])).toBe(false);
    expect(sameSession(a, [{ ...a[0], minimized: true }, a[1]])).toBe(false);
  });

  it('erkennt ein zusätzliches Fenster', () => {
    expect(sameSession(a, [...a, { ...a[0], appId: 'c-3' }])).toBe(false);
  });
});

describe('Runde durch die Persistenz (serialize → clean → restore)', () => {
  it('bringt Fenster unverändert zurück', () => {
    const session = serializeSession([
      win({ appId: 'a-1', x: 10, y: 20, w: 300, h: 240, z: 1, minimized: true }),
      win({ appId: 'b-2', x: 60, y: 70, w: 800, h: 600, z: 2, maximized: true }),
    ]);
    const stored = cleanSessions(JSON.parse(JSON.stringify({ '/apps': session })));
    expect(restorableSession(stored['/apps'], ['a-1', 'b-2'])).toEqual(session);
  });

  it('lässt eine inzwischen gelöschte App unterwegs fallen', () => {
    const session = serializeSession([win({ appId: 'a-1', z: 1 }), win({ appId: 'geloescht', z: 2 })]);
    const stored = cleanSessions({ '/apps': session });
    expect(restorableSession(stored['/apps'], ['a-1']).map((s) => s.appId)).toEqual(['a-1']);
  });
});

describe('cleanSessions', () => {
  const entry = { appId: 'a-1', x: 10, y: 20, w: 300, h: 240, minimized: false, maximized: false };

  it('nimmt eine leere Vorgabe für alles Unbrauchbare', () => {
    expect(cleanSessions(undefined)).toEqual({});
    expect(cleanSessions(null)).toEqual({});
    expect(cleanSessions('kaputt')).toEqual({});
    expect(cleanSessions({ '/apps': 'kaputt' })).toEqual({});
  });

  it('reicht saubere Einträge durch', () => {
    expect(cleanSessions({ '/apps': [entry] })).toEqual({ '/apps': [entry] });
  });

  it('wirft beschädigte Einträge weg', () => {
    expect(
      cleanSessions({
        '/apps': [
          entry,
          { ...entry, appId: '' },
          { ...entry, appId: 42 },
          { ...entry, x: 'links' },
          { ...entry, w: 0 },
          { ...entry, h: Number.NaN },
          null,
        ],
      }),
    ).toEqual({ '/apps': [entry] });
  });

  it('tütet Zahlen und Schalter ein', () => {
    const [clean] = cleanSessions({
      '/apps': [{ appId: 'a-1', x: -30, y: 12.6, w: 300.4, h: 240, minimized: 1, maximized: 'ja' }],
    })['/apps'];
    expect(clean).toEqual({ appId: 'a-1', x: 0, y: 13, w: 300, h: 240, minimized: true, maximized: true });
  });

  it('lässt Verzeichnisse ohne brauchbare Fenster weg', () => {
    expect(cleanSessions({ '/apps': [], '/andere': [{ appId: '' }] })).toEqual({});
  });

  it('deckelt die Zahl der Fenster je Verzeichnis', () => {
    const many = Array.from({ length: MAX_SESSION_WINDOWS + 5 }, (_, i) => ({ ...entry, appId: `a-${i}` }));
    expect(cleanSessions({ '/apps': many })['/apps']).toHaveLength(MAX_SESSION_WINDOWS);
  });
});
