import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDesktopStore } from './desktop';

describe('useDesktopStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('startet ohne Fenster', () => {
    const d = useDesktopStore();
    expect(d.windows).toEqual([]);
    expect(d.focusedId).toBeNull();
  });

  it('öffnet eine App als Fenster mit Titel und Icon', () => {
    const d = useDesktopStore();
    const id = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    expect(d.windows).toHaveLength(1);
    const w = d.windows[0];
    expect(w.instanceId).toBe(id);
    expect(w.appId).toBe('rechner-1');
    expect(w.title).toBe('Rechner');
    expect(w.icon).toBe('🧮');
    expect(w.minimized).toBe(false);
    expect(w.w).toBeGreaterThan(0);
    expect(w.h).toBeGreaterThan(0);
  });

  it('vergibt eindeutige, deterministische Instanz-Ids', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    const b = d.openDraft();
    expect(a).not.toBe(b);
  });

  it('fokussiert ein bereits offenes App-Fenster erneut, statt es zu duplizieren', () => {
    const d = useDesktopStore();
    const first = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    d.openApp('editor-2', { title: 'Editor', icon: '📝' });
    const again = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });

    expect(again).toBe(first);
    expect(d.windows).toHaveLength(2);
    expect(d.focusedId).toBe(first); // wieder nach vorn geholt
  });

  it('kaskadiert die Position neuer Fenster', () => {
    const d = useDesktopStore();
    d.openApp('a', { title: 'A', icon: '🅰' });
    d.openApp('b', { title: 'B', icon: '🅱' });
    expect(d.windows[1].x).toBeGreaterThan(d.windows[0].x);
    expect(d.windows[1].y).toBeGreaterThan(d.windows[0].y);
  });

  it('legt jedes neue/fokussierte Fenster nach vorn (z-Reihenfolge)', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    const b = d.openApp('b', { title: 'B', icon: '🅱' });
    expect(d.focusedId).toBe(b);

    d.focusWindow(a);
    expect(d.focusedId).toBe(a);
    const wa = d.windows.find((w) => w.instanceId === a)!;
    const wb = d.windows.find((w) => w.instanceId === b)!;
    expect(wa.z).toBeGreaterThan(wb.z);
  });

  it('schließt ein Fenster', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    d.closeWindow(a);
    expect(d.windows).toEqual([]);
  });

  it('minimiert und stellt ein Fenster wieder her (Wiederherstellen fokussiert)', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    const b = d.openApp('b', { title: 'B', icon: '🅱' });

    d.minimizeWindow(b);
    expect(d.windows.find((w) => w.instanceId === b)!.minimized).toBe(true);
    // Minimiert zählt nicht als fokussiert.
    expect(d.focusedId).toBe(a);

    d.restoreWindow(b);
    expect(d.windows.find((w) => w.instanceId === b)!.minimized).toBe(false);
    expect(d.focusedId).toBe(b);
  });

  it('verschiebt und verändert die Größe (mit Mindestgröße)', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    d.moveWindow(a, 300, 200);
    const w = d.windows.find((x) => x.instanceId === a)!;
    expect([w.x, w.y]).toEqual([300, 200]);

    d.resizeWindow(a, 10, 10); // unter Mindestgröße
    expect(w.w).toBeGreaterThanOrEqual(240);
    expect(w.h).toBeGreaterThanOrEqual(160);
  });

  it('hält keine negativen Positionen (Fenster bleibt im sichtbaren Bereich)', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    d.moveWindow(a, -50, -80);
    const w = d.windows.find((x) => x.instanceId === a)!;
    expect(w.x).toBeGreaterThanOrEqual(0);
    expect(w.y).toBeGreaterThanOrEqual(0);
  });

  it('aktualisiert Titel und Icon (Entwurf wird zur echten App)', () => {
    const d = useDesktopStore();
    const id = d.openDraft();
    expect(d.windows[0].appId).toBeNull();
    d.setAppMeta(id, 'rechner-9', 'Rechner', '🧮');
    const w = d.windows[0];
    expect(w.appId).toBe('rechner-9');
    expect(w.title).toBe('Rechner');
    expect(w.icon).toBe('🧮');
  });

  it('listet Fenster nach z sortiert (hinten → vorn) für stabiles Rendern', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    const b = d.openApp('b', { title: 'B', icon: '🅱' });
    d.focusWindow(a);
    expect(d.stacked.map((w) => w.instanceId)).toEqual([b, a]);
  });
});
