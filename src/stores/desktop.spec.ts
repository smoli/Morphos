import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDesktopStore } from './desktop';
import { useWorkspaceStore } from './workspace';
import { EXPLORER_ID, systemWindow } from '@/core/system';
import type { AppSummary, SessionWindow } from '@/types';

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

  it('maximiert ein Fenster und stellt es wieder her', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    expect(d.find(a)!.maximized).toBe(false);
    d.toggleMaximize(a);
    expect(d.find(a)!.maximized).toBe(true);
    d.toggleMaximize(a);
    expect(d.find(a)!.maximized).toBe(false);
  });

  describe('System-Fenster (Ansichten der Schale)', () => {
    it('öffnet den Datei-Explorer als Fenster ohne App', () => {
      const d = useDesktopStore();
      const id = d.openSystem(EXPLORER_ID);

      expect(id).not.toBeNull();
      const w = d.find(id!)!;
      expect(w.kind).toBe('system');
      expect(w.systemId).toBe(EXPLORER_ID);
      expect(w.appId).toBeNull();
      expect(w.title).toBe(systemWindow(EXPLORER_ID)!.title);
      expect(w.icon).toBe(systemWindow(EXPLORER_ID)!.icon);
    });

    it('legt ein App-Fenster als solches an', () => {
      const d = useDesktopStore();
      const app = d.find(d.openApp('a', { title: 'A', icon: '🅰' }))!;
      const draft = d.find(d.openDraft())!;
      expect([app.kind, draft.kind]).toEqual(['app', 'app']);
      expect([app.systemId, draft.systemId]).toEqual([null, null]);
    });

    it('holt beim zweiten Öffnen das bestehende Fenster nach vorn (nur eines)', () => {
      const d = useDesktopStore();
      const first = d.openSystem(EXPLORER_ID);
      d.openApp('a', { title: 'A', icon: '🅰' });

      const again = d.openSystem(EXPLORER_ID);

      expect(again).toBe(first);
      expect(d.windows).toHaveLength(2);
      expect(d.focusedId).toBe(first);
    });

    it('öffnet keine unbekannte Ansicht', () => {
      const d = useDesktopStore();
      expect(d.openSystem('gibt-es-nicht')).toBeNull();
      expect(d.windows).toEqual([]);
    });

    it('verhält sich wie jedes andere Fenster (Stapel, Minimieren, Maximieren, Schließen)', () => {
      const d = useDesktopStore();
      const sys = d.openSystem(EXPLORER_ID)!;
      const app = d.openApp('a', { title: 'A', icon: '🅰' });
      expect(d.focusedId).toBe(app);

      d.focusWindow(sys);
      expect(d.focusedId).toBe(sys);
      expect(d.stacked.map((w) => w.instanceId)).toEqual([app, sys]);

      d.minimizeWindow(sys);
      expect(d.find(sys)!.minimized).toBe(true);
      d.restoreWindow(sys);
      expect(d.find(sys)!.minimized).toBe(false);

      d.toggleMaximize(sys);
      expect(d.find(sys)!.maximized).toBe(true);

      d.closeWindow(sys);
      expect(d.windows.map((w) => w.instanceId)).toEqual([app]);
    });

    it('nimmt keine Wünsche entgegen — die Promptleiste zielt auf App-Fenster', () => {
      const d = useDesktopStore();
      const app = d.openApp('a', { title: 'A', icon: '🅰' });
      expect(d.activeAppId).toBe(app);

      const sys = d.openSystem(EXPLORER_ID)!;
      expect(d.activeId).toBe(sys);
      expect(d.activeAppId).toBeNull();
    });

    it('wird nicht in der Sitzung gemerkt (es gibt nichts zu laden)', () => {
      const ws = useWorkspaceStore();
      ws.folder = '/apps';
      const d = useDesktopStore();
      d.openSystem(EXPLORER_ID);
      expect(ws.session).toEqual([]);
    });
  });

  describe('Einzel-Modus: zurück zum Desktop', () => {
    it('hat ohne Zutun kein „Desktop zeigen“ aktiv', () => {
      const d = useDesktopStore();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      expect(d.showingDesktop).toBe(false);
      expect(d.activeId).toBe(a);
    });

    it('blendet im Einzel-Modus über showDesktop() das aktive Fenster aus', () => {
      useWorkspaceStore().uiMode = 'single';
      const d = useDesktopStore();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });

      d.showDesktop();
      expect(d.activeId).toBeNull();
      // Das Fenster bleibt offen — es wird nur nicht gezeigt.
      expect(d.windows).toHaveLength(1);
      expect(d.focusedId).toBe(a);
    });

    it('holt ein Fenster über focusWindow/restoreWindow zurück in den Vordergrund', () => {
      useWorkspaceStore().uiMode = 'single';
      const d = useDesktopStore();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      d.showDesktop();

      d.restoreWindow(a);
      expect(d.showingDesktop).toBe(false);
      expect(d.activeId).toBe(a);
    });

    it('zeigt ein neu geöffnetes Fenster sofort (Desktop-Ansicht endet)', () => {
      useWorkspaceStore().uiMode = 'single';
      const d = useDesktopStore();
      d.openApp('a', { title: 'A', icon: '🅰' });
      d.showDesktop();

      const b = d.openDraft();
      expect(d.showingDesktop).toBe(false);
      expect(d.activeId).toBe(b);
    });

    it('wirkt sich im Fenster-Modus nicht aus', () => {
      const d = useDesktopStore();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      d.showDesktop();
      expect(d.activeId).toBe(a);
    });
  });

  describe('Sitzung: merken und wiederherstellen', () => {
    const apps: AppSummary[] = [
      { id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5, versions: 3 },
      { id: 'editor-2', name: 'Editor', icon: '📝', createdAt: 2, updatedAt: 9, versions: 1 },
    ];

    /** Ein geöffnetes Verzeichnis mit Apps und (optional) einer gemerkten Sitzung. */
    function workspace(session?: SessionWindow[], appList: AppSummary[] = apps) {
      const ws = useWorkspaceStore();
      ws.folder = '/apps';
      ws.apps = appList;
      if (session) ws.sessions = { '/apps': session };
      return ws;
    }

    function entry(over: Partial<SessionWindow> = {}): SessionWindow {
      return { appId: 'rechner-1', x: 10, y: 20, w: 300, h: 240, minimized: false, maximized: false, ...over };
    }

    afterEach(() => vi.useRealTimers());

    it('merkt ein geöffnetes Fenster mit seiner Geometrie', () => {
      const ws = workspace();
      const d = useDesktopStore();
      const id = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      const w = d.find(id)!;

      expect(ws.session).toEqual([
        { appId: 'rechner-1', x: w.x, y: w.y, w: w.w, h: w.h, minimized: false, maximized: false },
      ]);
    });

    it('merkt einen unbenannten Entwurf nicht', () => {
      const ws = workspace();
      useDesktopStore().openDraft();
      expect(ws.session).toEqual([]);
    });

    it('merkt einen Entwurf, sobald er eine App geworden ist', () => {
      const ws = workspace();
      const d = useDesktopStore();
      const id = d.openDraft();
      d.setAppMeta(id, 'rechner-1', 'Rechner', '🧮');
      expect(ws.session.map((s) => s.appId)).toEqual(['rechner-1']);
    });

    it('vergisst ein geschlossenes Fenster', () => {
      const ws = workspace();
      const d = useDesktopStore();
      const a = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      d.openApp('editor-2', { title: 'Editor', icon: '📝' });

      d.closeWindow(a);

      expect(ws.session.map((s) => s.appId)).toEqual(['editor-2']);
    });

    it('merkt Minimieren und Maximieren', () => {
      const ws = workspace();
      const d = useDesktopStore();
      const a = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });

      d.minimizeWindow(a);
      expect(ws.session[0].minimized).toBe(true);

      d.toggleMaximize(a);
      expect(ws.session[0].maximized).toBe(true);
    });

    it('merkt die Stapelreihenfolge nach dem Fokussieren', () => {
      const ws = workspace();
      const d = useDesktopStore();
      const a = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      d.openApp('editor-2', { title: 'Editor', icon: '📝' });

      d.focusWindow(a);

      // Hinten → vorn: das zuletzt fokussierte Fenster steht am Ende.
      expect(ws.session.map((s) => s.appId)).toEqual(['editor-2', 'rechner-1']);
    });

    it('schreibt Verschieben und Größenänderung erst nach kurzer Ruhe', () => {
      vi.useFakeTimers();
      const ws = workspace();
      const d = useDesktopStore();
      const a = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });

      d.moveWindow(a, 111, 222);
      d.resizeWindow(a, 400, 300);
      // Noch steht der Stand von vor dem Ziehen — jeder Mausschritt soll nicht
      // die Einstellungen schreiben.
      expect(ws.session[0].x).not.toBe(111);

      vi.runAllTimers();

      expect(ws.session[0]).toMatchObject({ x: 111, y: 222, w: 400, h: 300 });
    });

    it('öffnet die gemerkten Fenster wieder — Geometrie, Zustand, Stapel', () => {
      workspace([
        entry({ appId: 'editor-2', x: 5, y: 6, w: 400, h: 300, minimized: true }),
        entry({ appId: 'rechner-1', x: 10, y: 20, w: 300, h: 240, maximized: true }),
      ]);
      const d = useDesktopStore();

      d.restoreSession();

      expect(d.stacked.map((w) => w.appId)).toEqual(['editor-2', 'rechner-1']);
      const [editor, rechner] = d.stacked;
      expect(editor).toMatchObject({ title: 'Editor', icon: '📝', x: 5, y: 6, w: 400, h: 300, minimized: true });
      expect(rechner).toMatchObject({ title: 'Rechner', x: 10, y: 20, w: 300, h: 240, maximized: true });
      // Der Fokus landet auf dem zuletzt benutzten Fenster.
      expect(d.focusedId).toBe(rechner.instanceId);
    });

    it('überspringt ein Fenster, dessen App es nicht mehr gibt', () => {
      const ws = workspace([entry({ appId: 'geloescht-7' }), entry({ appId: 'rechner-1' })]);
      const d = useDesktopStore();

      d.restoreSession();

      expect(d.windows.map((w) => w.appId)).toEqual(['rechner-1']);
      // Die verschwundene App wird auch nicht weiter mitgeschleppt.
      expect(ws.session.map((s) => s.appId)).toEqual(['rechner-1']);
    });

    it('öffnet ohne gemerkte Sitzung nichts (erster Start)', () => {
      workspace();
      const d = useDesktopStore();
      d.restoreSession();
      expect(d.windows).toEqual([]);
    });

    it('stellt je Verzeichnis nur einmal wieder her', () => {
      workspace([entry()]);
      const d = useDesktopStore();

      d.restoreSession();
      d.closeWindow(d.windows[0].instanceId);
      d.restoreSession();

      expect(d.windows).toEqual([]);
    });

    it('wartet, solange das Verzeichnis noch keine Apps gemeldet hat', () => {
      const ws = workspace([entry()], []);
      const d = useDesktopStore();

      d.restoreSession();
      expect(d.windows).toEqual([]);

      // Sobald die Apps da sind, kommt die Sitzung zurück.
      ws.apps = apps;
      d.restoreSession();
      expect(d.windows.map((w) => w.appId)).toEqual(['rechner-1']);
    });

    it('rührt ohne geöffnetes Verzeichnis nichts an', () => {
      const d = useDesktopStore();
      d.restoreSession();
      expect(d.windows).toEqual([]);
    });
  });
});
