import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDesktopStore } from './desktop';
import { useWorkspaceStore } from './workspace';
import { DEFAULT_TILE_GAP as TILE_GAP } from '@/core/tilesettings';
import { EXPLORER_ID, systemWindow } from '@/core/system';
import { leaf, leafIds, MIN_TILE, split, type Rect, type TileTree } from '@/core/tiling';
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

  // Den Stapel macht allein das z jedes Fensters: Die Ansicht zeichnet die
  // Fenster in der Reihenfolge, in der sie geöffnet wurden, und legt sie über
  // den z-index übereinander. Umsortieren hieße, ihre iframes im DOM
  // umzuhängen — und damit die laufenden Apps neu zu laden (i0005).
  it('hebt ein Fenster im Stapel (z), ohne die Liste umzusortieren', () => {
    const d = useDesktopStore();
    const a = d.openApp('a', { title: 'A', icon: '🅰' });
    const b = d.openApp('b', { title: 'B', icon: '🅱' });
    expect(d.find(b)!.z).toBeGreaterThan(d.find(a)!.z);

    d.focusWindow(a);

    expect(d.find(a)!.z).toBeGreaterThan(d.find(b)!.z);
    expect(d.windows.map((w) => w.instanceId)).toEqual([a, b]);
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
      expect(d.find(sys)!.z).toBeGreaterThan(d.find(app)!.z);

      d.minimizeWindow(sys);
      expect(d.find(sys)!.minimized).toBe(true);
      d.restoreWindow(sys);
      expect(d.find(sys)!.minimized).toBe(false);

      d.toggleMaximize(sys);
      expect(d.find(sys)!.maximized).toBe(true);

      d.closeWindow(sys);
      expect(d.windows.map((w) => w.instanceId)).toEqual([app]);
    });

    it('nimmt keine Wünsche entgegen — nur ein App-Fenster ist aktiv im Sinne des Chats', () => {
      const d = useDesktopStore();
      const app = d.openApp('a', { title: 'A', icon: '🅰' });
      expect(d.activeAppId).toBe(app);

      const sys = d.openSystem(EXPLORER_ID)!;
      expect(d.activeId).toBe(sys);
      expect(d.activeAppId).toBeNull();
    });

    it('wird wie ein App-Fenster in der Sitzung gemerkt', () => {
      const ws = useWorkspaceStore();
      ws.folder = '/apps';
      const d = useDesktopStore();
      const w = d.find(d.openSystem(EXPLORER_ID)!)!;
      expect(ws.session).toEqual([
        { appId: null, systemId: EXPLORER_ID, x: w.x, y: w.y, w: w.w, h: w.h, minimized: false, maximized: false },
      ]);
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

      expect(d.windows.map((w) => w.appId)).toEqual(['editor-2', 'rechner-1']);
      const [editor, rechner] = d.windows;
      expect(editor).toMatchObject({ title: 'Editor', icon: '📝', x: 5, y: 6, w: 400, h: 300, minimized: true });
      expect(rechner).toMatchObject({ title: 'Rechner', x: 10, y: 20, w: 300, h: 240, maximized: true });
      // Der Fokus landet auf dem zuletzt benutzten Fenster.
      expect(d.focusedId).toBe(rechner.instanceId);
    });

    it('bringt auch die Fenster der Schale zurück (Dateien, Einstellungen)', () => {
      workspace([
        { appId: null, systemId: EXPLORER_ID, x: 5, y: 6, w: 400, h: 300, minimized: true, maximized: false },
        entry({ appId: 'rechner-1' }),
      ]);
      const d = useDesktopStore();

      d.restoreSession();

      const [explorer, rechner] = d.windows;
      expect(explorer).toMatchObject({
        kind: 'system',
        systemId: EXPLORER_ID,
        appId: null,
        title: systemWindow(EXPLORER_ID)!.title,
        x: 5,
        y: 6,
        w: 400,
        h: 300,
        minimized: true,
      });
      expect(rechner.appId).toBe('rechner-1');
    });

    it('überspringt ein Fenster, dessen Ansicht es nicht mehr gibt', () => {
      const ws = workspace([
        { appId: null, systemId: 'weg', x: 5, y: 6, w: 400, h: 300, minimized: false, maximized: false },
        entry(),
      ]);
      const d = useDesktopStore();

      d.restoreSession();

      expect(d.windows.map((w) => w.systemId)).toEqual([null]);
      expect(ws.session.map((s) => s.appId)).toEqual(['rechner-1']);
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

  describe('Kachel-Modus', () => {
    const AREA: Rect = { x: 0, y: 0, w: 1200, h: 800 };

    /** Ein Desktop im Kachel-Modus, mit einer gemessenen Fläche. */
    function tiled(): ReturnType<typeof useDesktopStore> {
      useWorkspaceStore().uiMode = 'tiles';
      const d = useDesktopStore();
      d.setTileArea(AREA);
      return d;
    }

    /** Überschneiden sich zwei Rechtecke (bei Berührung noch nicht)? */
    function overlaps(a: Rect, b: Rect): boolean {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    }

    function expectDisjointWithin(rects: Rect[], area: Rect): void {
      for (const r of rects) {
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x).toBeGreaterThanOrEqual(area.x);
        expect(r.y).toBeGreaterThanOrEqual(area.y);
        expect(r.x + r.w).toBeLessThanOrEqual(area.x + area.w);
        expect(r.y + r.h).toBeLessThanOrEqual(area.y + area.h);
      }
      for (let i = 0; i < rects.length; i += 1)
        for (let j = i + 1; j < rects.length; j += 1) expect(overlaps(rects[i], rects[j])).toBe(false);
    }

    it('hält im Fenster-Modus gar keinen Baum', () => {
      const d = useDesktopStore();
      d.openApp('a', { title: 'A', icon: '🅰' });
      expect(d.tiling).toBe(false);
      expect(d.tileTree).toBeNull();
      expect(d.tileRects).toEqual({});
    });

    it('kachelt beim Wechsel in den Kachel-Modus die offenen Fenster', () => {
      const d = useDesktopStore();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      const b = d.openApp('b', { title: 'B', icon: '🅱' });
      const c = d.openDraft();

      useWorkspaceStore().uiMode = 'tiles';
      d.setTileArea(AREA);
      d.syncTiles();

      expect(leafIds(d.tileTree).sort()).toEqual([a, b, c].sort());
      expectDisjointWithin(Object.values(d.tileRects), AREA);
    });

    it('nimmt jedes neu geöffnete Fenster in den Verbund auf', () => {
      const d = tiled();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      const b = d.openApp('b', { title: 'B', icon: '🅱' });

      expect(leafIds(d.tileTree)).toEqual([a, b]);
      expectDisjointWithin(Object.values(d.tileRects), AREA);
      // Zwei Kacheln teilen die (breitere) Fläche nebeneinander.
      expect(d.tileRects[a].x).toBeLessThan(d.tileRects[b].x);
      expect(d.tileRects[a].y).toBe(d.tileRects[b].y);
    });

    it('teilt die Kachel mit dem Brennpunkt, nicht irgendeine', () => {
      const d = tiled();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      d.openApp('b', { title: 'B', icon: '🅱' });
      // Zurück auf die linke Kachel — dort soll das nächste Fenster hinein.
      d.focusWindow(a);
      const before = d.tileRects[a];

      const c = d.openApp('c', { title: 'C', icon: '🇨' });

      // a hat Platz gemacht, b nicht.
      expect(d.tileRects[a].h).toBeLessThan(before.h);
      expect(d.tileRects[c].x).toBe(d.tileRects[a].x);
      expectDisjointWithin(Object.values(d.tileRects), AREA);
    });

    it('lässt beim Schließen die Schwester den Platz erben', () => {
      const d = tiled();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      const b = d.openApp('b', { title: 'B', icon: '🅱' });

      d.closeWindow(b);

      expect(leafIds(d.tileTree)).toEqual([a]);
      expect(d.tileRects[a]).toEqual(AREA);
    });

    it('räumt den Baum ab, wenn das letzte Fenster zugeht', () => {
      const d = tiled();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      d.closeWindow(a);
      expect(d.tileTree).toBeNull();
      expect(d.tileRects).toEqual({});
    });

    it('nimmt ein minimiertes Fenster heraus und beim Wiederherstellen zurück', () => {
      const d = tiled();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      const b = d.openApp('b', { title: 'B', icon: '🅱' });

      d.minimizeWindow(b);
      expect(leafIds(d.tileTree)).toEqual([a]);
      expect(d.tileRects[a]).toEqual(AREA);
      expect(d.tileRects[b]).toBeUndefined();

      d.restoreWindow(b);
      expect(leafIds(d.tileTree).sort()).toEqual([a, b].sort());
      expectDisjointWithin(Object.values(d.tileRects), AREA);
    });

    it('lässt den Baum unberührt, während ein Fenster maximiert ist', () => {
      const d = tiled();
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      const b = d.openApp('b', { title: 'B', icon: '🅱' });
      const before = d.tileRects;

      d.toggleMaximize(b);
      expect(leafIds(d.tileTree)).toEqual([a, b]);
      d.toggleMaximize(b);
      // Zurück in dieselbe Anordnung.
      expect(d.tileRects).toEqual(before);
    });

    it('rechnet die Kacheln auf eine geänderte Fläche um', () => {
      const d = tiled();
      d.openApp('a', { title: 'A', icon: '🅰' });
      d.openApp('b', { title: 'B', icon: '🅱' });

      const area: Rect = { x: 10, y: 20, w: 600, h: 900 };
      d.setTileArea(area);
      expectDisjointWithin(Object.values(d.tileRects), area);
    });

    it('kachelt eine wiederhergestellte Sitzung ohne die minimierten Fenster', () => {
      const ws = useWorkspaceStore();
      ws.uiMode = 'tiles';
      ws.folder = '/apps';
      ws.apps = [
        { id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5, versions: 3 },
        { id: 'editor-2', name: 'Editor', icon: '📝', createdAt: 2, updatedAt: 9, versions: 1 },
      ];
      const geom = { x: 10, y: 20, w: 300, h: 240, maximized: false };
      ws.sessions = {
        '/apps': [
          { appId: 'rechner-1', ...geom, minimized: false },
          { appId: 'editor-2', ...geom, minimized: true },
        ],
      };
      const d = useDesktopStore();
      d.setTileArea(AREA);

      d.restoreSession();

      const offen = d.windows.find((w) => w.appId === 'rechner-1')!.instanceId;
      expect(leafIds(d.tileTree)).toEqual([offen]);
      expect(d.tileRects[offen]).toEqual(AREA);
    });

    it('hält den Baum je Verzeichnis getrennt', () => {
      const ws = useWorkspaceStore();
      ws.uiMode = 'tiles';
      ws.folder = '/eins';
      const d = useDesktopStore();
      d.setTileArea(AREA);
      const a = d.openApp('a', { title: 'A', icon: '🅰' });
      expect(leafIds(d.tileTree)).toEqual([a]);

      ws.folder = '/zwei';
      expect(d.tileTree).toBeNull();

      ws.folder = '/eins';
      expect(leafIds(d.tileTree)).toEqual([a]);
    });

    describe('Fuge nach Einstellung (c0072)', () => {
      /** Ein gekacheltes Verzeichnis mit gewählter Fuge. */
      function mitFuge(gap: number): ReturnType<typeof useDesktopStore> {
        const ws = useWorkspaceStore();
        ws.uiMode = 'tiles';
        ws.folder = '/apps';
        ws.tileGaps = { '/apps': gap };
        const d = useDesktopStore();
        d.setTileArea(AREA);
        return d;
      }

      it('nimmt ohne eigene Wahl die Vorgabe', () => {
        const d = tiled();
        expect(d.tileGap).toBe(TILE_GAP);
      });

      it('rechnet mit der gewählten Fuge statt mit der Vorgabe', () => {
        const d = mitFuge(30);
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        const b = d.openApp('b', { title: 'B', icon: '🅱' });

        expect(d.tileGap).toBe(30);
        expect(d.tileRects[b].x - (d.tileRects[a].x + d.tileRects[a].w)).toBe(30);
        expect(d.tileRects[a].w + d.tileRects[b].w).toBe(AREA.w - 30);
        expectDisjointWithin(Object.values(d.tileRects), AREA);
      });

      it('legt die Kacheln bei Fuge null lückenlos aneinander', () => {
        const d = mitFuge(0);
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        const b = d.openApp('b', { title: 'B', icon: '🅱' });

        expect(d.tileRects[b].x).toBe(d.tileRects[a].x + d.tileRects[a].w);
        expect(d.tileRects[a].w + d.tileRects[b].w).toBe(AREA.w);
        expectDisjointWithin(Object.values(d.tileRects), AREA);
      });

      it('rückt die Kacheln nach, sobald die Fuge sich ändert', () => {
        const ws = useWorkspaceStore();
        const d = mitFuge(0);
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        d.openApp('b', { title: 'B', icon: '🅱' });
        const vorher = d.tileRects[a].w;

        ws.tileGaps = { '/apps': 40 };

        expect(d.tileRects[a].w).toBe(vorher - 20);
      });
    });

    describe('an der Fuge ziehen (c0067)', () => {
      it('verschiebt die Teilung dorthin, wo der Zeiger sie hinzieht', () => {
        const d = tiled();
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        const b = d.openApp('b', { title: 'B', icon: '🅱' });
        const vorher = d.tileRects[a].w;

        d.dragGap([], { x: 300, y: 400 });

        // Die Fuge sitzt mittig unter dem Zeiger, links bleibt weniger übrig.
        expect(d.tileRects[a].w).toBeLessThan(vorher);
        expect(d.tileRects[a].w).toBeCloseTo(300 - TILE_GAP / 2, 0);
        // Und rechts kommt genau so viel dazu — überschneidungsfrei.
        expectDisjointWithin(Object.values(d.tileRects), AREA);
        expect(d.tileRects[a].w + d.tileRects[b].w).toBe(AREA.w - TILE_GAP);
      });

      it('lässt keine Kachel unter die Mindestgröße rutschen', () => {
        const d = tiled();
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        d.openApp('b', { title: 'B', icon: '🅱' });

        d.dragGap([], { x: -400, y: 400 });
        expect(d.tileRects[a].w).toBeGreaterThanOrEqual(MIN_TILE);
      });

      it('zieht auch an einer inneren Fuge, ohne die äußere zu stören', () => {
        const d = tiled();
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        const b = d.openApp('b', { title: 'B', icon: '🅱' });
        const c = d.openApp('c', { title: 'C', icon: '🇨' });
        const außen = d.tileRects[a];

        d.dragGap(['b'], { x: 900, y: 200 });

        expect(d.tileRects[a]).toEqual(außen);
        expect(d.tileRects[b].h).toBeCloseTo(200 - AREA.y - TILE_GAP / 2, 0);
        expectDisjointWithin(Object.values(d.tileRects), AREA);
        expect(leafIds(d.tileTree)).toEqual([a, b, c]);
      });

      it('rührt außerhalb des Kachel-Modus nichts an', () => {
        const d = useDesktopStore();
        d.setTileArea(AREA);
        d.openApp('a', { title: 'A', icon: '🅰' });
        d.dragGap([], { x: 300, y: 400 });
        expect(d.tileTree).toBeNull();
      });
    });

    describe('Kacheln tauschen (c0067)', () => {
      /** Zwei Kachel-Fenster nebeneinander. */
      function zwei() {
        const d = tiled();
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        const b = d.openApp('b', { title: 'B', icon: '🅱' });
        return { d, a, b };
      }

      /** Die Mitte einer Kachel — dort zielt die Maus hin. */
      function mitte(r: Rect) {
        return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      }

      it('tauscht die Plätze zweier Fenster', () => {
        const { d, a, b } = zwei();
        const vorher = { ...d.tileRects };

        expect(d.startTileSwap(a)).toBe(true);
        d.aimTileSwap(mitte(vorher[b]));
        expect(d.tileSwap).toEqual({ id: a, targetId: b });
        d.dropTileSwap();

        expect(d.tileSwap).toBeNull();
        expect(d.tileRects[a]).toEqual(vorher[b]);
        expect(d.tileRects[b]).toEqual(vorher[a]);
      });

      it('nimmt die eigene Kachel nicht als Ziel', () => {
        const { d, a } = zwei();
        const vorher = { ...d.tileRects };

        d.startTileSwap(a);
        d.aimTileSwap(mitte(vorher[a]));
        expect(d.tileSwap?.targetId).toBeNull();
        d.dropTileSwap();

        expect(d.tileRects).toEqual(vorher);
      });

      it('lässt über der Fuge und daneben alles, wie es war', () => {
        const { d, a, b } = zwei();
        const vorher = { ...d.tileRects };

        d.startTileSwap(a);
        d.aimTileSwap(mitte(vorher[b]));
        // Zurück auf die Fuge zwischen beiden — dort liegt keine Kachel.
        d.aimTileSwap({ x: vorher[a].w + TILE_GAP / 2, y: 400 });
        expect(d.tileSwap?.targetId).toBeNull();
        d.dropTileSwap();

        expect(d.tileRects).toEqual(vorher);
      });

      it('hebt außerhalb des Kachel-Modus gar nichts erst auf', () => {
        const d = useDesktopStore();
        const a = d.openApp('a', { title: 'A', icon: '🅰' });
        expect(d.startTileSwap(a)).toBe(false);
        expect(d.tileSwap).toBeNull();
      });

      it('bricht ab, ohne zu tauschen', () => {
        const { d, a, b } = zwei();
        const vorher = { ...d.tileRects };

        d.startTileSwap(a);
        d.aimTileSwap(mitte(vorher[b]));
        d.cancelTileSwap();

        expect(d.tileSwap).toBeNull();
        expect(d.tileRects).toEqual(vorher);
      });
    });

    describe('Anordnung merken (c0068)', () => {
      const apps: AppSummary[] = [
        { id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5, versions: 3 },
        { id: 'editor-2', name: 'Editor', icon: '📝', createdAt: 2, updatedAt: 9, versions: 1 },
      ];

      /** Ein gekacheltes Verzeichnis mit Apps, gemerkter Sitzung und Anordnung. */
      function gemerkt(session?: SessionWindow[], layout?: TileTree, appList: AppSummary[] = apps) {
        const ws = useWorkspaceStore();
        ws.uiMode = 'tiles';
        ws.folder = '/apps';
        ws.apps = appList;
        if (session) ws.sessions = { '/apps': session };
        if (layout) ws.tileLayouts = { '/apps': layout };
        const d = useDesktopStore();
        d.setTileArea(AREA);
        return { ws, d };
      }

      function eintrag(appId: string, over: Partial<SessionWindow> = {}): SessionWindow {
        return { appId, x: 10, y: 20, w: 300, h: 240, minimized: false, maximized: false, ...over };
      }

      afterEach(() => vi.useRealTimers());

      it('merkt die Kacheln unter App und Ansicht, nicht unter der Fenster-Id', () => {
        const { ws, d } = gemerkt();
        d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
        d.openApp('editor-2', { title: 'Editor', icon: '📝' });

        expect(ws.tileLayout).toEqual(split('row', leaf('app:rechner-1'), leaf('app:editor-2')));
      });

      it('merkt ein neues Verhältnis, sobald die Hand an der Fuge stillhält', () => {
        vi.useFakeTimers();
        const { ws, d } = gemerkt();
        d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
        d.openApp('editor-2', { title: 'Editor', icon: '📝' });

        d.dragGap([], { x: 300, y: 400 });
        // Noch steht der Stand von vor dem Ziehen — jeder Mausschritt soll nicht
        // die Einstellungen schreiben.
        expect((ws.tileLayout as Extract<TileTree, { kind: 'split' }>).ratio).toBe(0.5);

        vi.runAllTimers();

        const gezogen = ws.tileLayout as Extract<TileTree, { kind: 'split' }>;
        expect(gezogen.ratio).toBeCloseTo((300 - TILE_GAP / 2) / (AREA.w - TILE_GAP), 3);
      });

      it('merkt einen Tausch zweier Kacheln', () => {
        const { ws, d } = gemerkt();
        const a = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
        d.openApp('editor-2', { title: 'Editor', icon: '📝' });
        const ziel = d.tileRects[d.windows[1].instanceId];

        d.startTileSwap(a);
        d.aimTileSwap({ x: ziel.x + ziel.w / 2, y: ziel.y + ziel.h / 2 });
        d.dropTileSwap();

        expect(ws.tileLayout).toEqual(split('row', leaf('app:editor-2'), leaf('app:rechner-1')));
      });

      it('vergisst die Anordnung, wenn die letzte Kachel zugeht', () => {
        const { ws, d } = gemerkt();
        const a = d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
        expect(ws.tileLayout).not.toBeNull();

        d.closeWindow(a);

        expect(ws.tileLayouts).toEqual({});
      });

      it('rührt die gemerkte Anordnung außerhalb des Kachel-Modus nicht an', () => {
        const { ws, d } = gemerkt();
        ws.uiMode = 'windows';
        ws.tileLayouts = { '/apps': leaf('app:rechner-1') };

        d.openApp('editor-2', { title: 'Editor', icon: '📝' });

        expect(ws.tileLayout).toEqual(leaf('app:rechner-1'));
      });

      it('holt die Anordnung beim Start zurück — Reihenfolge und Verhältnis', () => {
        const { d } = gemerkt(
          [eintrag('rechner-1'), eintrag('editor-2')],
          split('row', leaf('app:editor-2'), leaf('app:rechner-1'), 0.25),
        );

        d.restoreSession();

        const rechner = d.windows.find((w) => w.appId === 'rechner-1')!.instanceId;
        const editor = d.windows.find((w) => w.appId === 'editor-2')!.instanceId;
        expect(leafIds(d.tileTree)).toEqual([editor, rechner]);
        expect(d.tileRects[editor].x).toBeLessThan(d.tileRects[rechner].x);
        expect(d.tileRects[editor].w).toBeCloseTo((AREA.w - TILE_GAP) * 0.25, 0);
        expectDisjointWithin(Object.values(d.tileRects), AREA);
      });

      it('lässt eine App, die es nicht mehr gibt, aus der Anordnung fallen', () => {
        const { d } = gemerkt(
          [eintrag('rechner-1'), eintrag('geloescht-7')],
          split('row', leaf('app:geloescht-7'), leaf('app:rechner-1'), 0.25),
          [apps[0]],
        );

        d.restoreSession();

        const rechner = d.windows.find((w) => w.appId === 'rechner-1')!.instanceId;
        expect(d.windows).toHaveLength(1);
        // Kein leeres Rechteck bleibt zurück: Die Schwester erbt die ganze Fläche.
        expect(leafIds(d.tileTree)).toEqual([rechner]);
        expect(d.tileRects[rechner]).toEqual(AREA);
      });

      it('kachelt ein Fenster dazu, das in der Anordnung fehlt', () => {
        const { d } = gemerkt([eintrag('rechner-1'), eintrag('editor-2')], leaf('app:rechner-1'));

        d.restoreSession();

        expect(leafIds(d.tileTree)).toHaveLength(2);
        expectDisjointWithin(Object.values(d.tileRects), AREA);
      });

      it('schreibt die aufgeräumte Anordnung nach dem Wiederherstellen zurück', () => {
        const { ws, d } = gemerkt(
          [eintrag('rechner-1')],
          split('row', leaf('app:geloescht-7'), leaf('app:rechner-1'), 0.25),
          [apps[0]],
        );

        d.restoreSession();

        expect(ws.tileLayout).toEqual(leaf('app:rechner-1'));
      });

      it('hält auch die gemerkte Anordnung je Verzeichnis getrennt', () => {
        const { ws, d } = gemerkt();
        d.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });

        ws.folder = '/zwei';
        d.openApp('editor-2', { title: 'Editor', icon: '📝' });

        // Das andere Verzeichnis bekommt seinen eigenen Eintrag, der erste bleibt.
        expect(ws.tileLayouts['/apps']).toEqual(leaf('app:rechner-1'));
        expect(leafIds(ws.tileLayouts['/zwei'])).toContain('app:editor-2');
      });
    });

    it('rechnet Mauspunkte in die Bühne um', () => {
      const d = useDesktopStore();
      expect(d.stagePoint({ clientX: 120, clientY: 90 })).toEqual({ x: 120, y: 90 });

      d.setStageOrigin({ x: 20, y: 48 });
      expect(d.stagePoint({ clientX: 120, clientY: 90 })).toEqual({ x: 100, y: 42 });
    });
  });
});
