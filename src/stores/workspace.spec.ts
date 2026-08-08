import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkspaceStore } from './workspace';
import { setHost } from '@/services/host';
import type { MorphosHost, AppSummary, Settings } from '@/types';

const apps: AppSummary[] = [
  { id: 'a-1', name: 'A', icon: '🅰', createdAt: 1, updatedAt: 5, versions: 2 },
  { id: 'b-2', name: 'B', icon: '🅱', createdAt: 2, updatedAt: 9, versions: 1 },
];

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    saveChat: vi.fn(async () => ({ ok: true })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => apps),
    loadApp: vi.fn(async () => null),
    saveApp: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...overrides,
  };
}

describe('useWorkspaceStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lädt die zuletzt genutzten Ordner beim Init', async () => {
    setHost(makeHost({ loadSettings: vi.fn(async () => ({ recentFolders: ['/x', '/y'], accessRoots: {} })) }));
    const ws = useWorkspaceStore();
    await ws.init();
    expect(ws.recentFolders).toEqual(['/x', '/y']);
    expect(ws.hasFolder).toBe(false);
  });

  it('öffnet einen Ordner, merkt ihn vor (neuestes zuerst) und lädt die Apps', async () => {
    const host = makeHost();
    setHost(host);
    const ws = useWorkspaceStore();
    ws.recentFolders = ['/alt'];

    await ws.openFolder('/neu');

    expect(ws.folder).toBe('/neu');
    expect(ws.recentFolders[0]).toBe('/neu');
    expect(ws.apps).toHaveLength(2);
    expect(host.saveSettings).toHaveBeenCalledWith({ recentFolders: ['/neu', '/alt'], accessRoots: {}, permissions: {}, libWhitelist: [], uiMode: 'windows', maxAgents: 2, iconPositions: {}, sessions: {} });
    expect(host.listApps).toHaveBeenCalledWith('/neu');
  });

  it('dedupliziert einen bereits bekannten Ordner an die Spitze', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    ws.recentFolders = ['/a', '/b'];
    await ws.openFolder('/b');
    expect(ws.recentFolders).toEqual(['/b', '/a']);
  });

  it('öffnet über chooseFolder den gewählten Ordner', async () => {
    const host = makeHost({ chooseFolder: vi.fn(async () => ({ ok: true, path: '/gewaehlt' })) });
    setHost(host);
    const ws = useWorkspaceStore();

    const ok = await ws.chooseFolder();
    expect(ok).toBe(true);
    expect(ws.folder).toBe('/gewaehlt');
  });

  it('tut bei abgebrochener Ordnerauswahl nichts', async () => {
    setHost(makeHost({ chooseFolder: vi.fn(async () => ({ ok: false })) }));
    const ws = useWorkspaceStore();
    const ok = await ws.chooseFolder();
    expect(ok).toBe(false);
    expect(ws.folder).toBeNull();
  });

  it('löscht eine App und lädt die Liste neu', async () => {
    const host = makeHost();
    setHost(host);
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');

    await ws.removeApp('a-1');
    expect(host.deleteApp).toHaveBeenCalledWith('/neu', 'a-1');
    expect(host.listApps).toHaveBeenCalledTimes(2);
  });

  it('lädt den Zugriffsordner je Workspace aus den Einstellungen', async () => {
    setHost(makeHost({
      loadSettings: vi.fn(async () => ({ recentFolders: ['/neu'], accessRoots: { '/neu': '/daten' } })),
    }));
    const ws = useWorkspaceStore();
    await ws.init();
    expect(ws.accessRoot).toBeNull(); // noch kein Ordner geöffnet
    await ws.openFolder('/neu');
    expect(ws.accessRoot).toBe('/daten');
  });

  it('legt den Zugriffsordner per Dialog fest und speichert ihn', async () => {
    const host = makeHost({ chooseFolder: vi.fn(async () => ({ ok: true, path: '/daten' })) });
    setHost(host);
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');

    const ok = await ws.setAccessFolder();
    expect(ok).toBe(true);
    expect(ws.accessRoot).toBe('/daten');
    expect(host.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessRoots: { '/neu': '/daten' } }),
    );
  });

  it('nutzt die Vorgaben: Lesen still erlaubt, Schreiben fragt', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');
    expect(ws.permissionFor('read')).toBe('allow');
    expect(ws.permissionFor('write')).toBe('ask');
  });

  it('führt still-erlaubte Operationen ohne Nachfrage aus', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');
    await expect(ws.authorizeFs('read', 'a.txt')).resolves.toBe(true);
    expect(ws.pendingPermission).toBeNull();
  });

  it('lehnt Operationen mit Modus "deny" ohne Nachfrage ab', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');
    ws.setPermission('delete', 'deny');
    await expect(ws.authorizeFs('delete', 'a.txt')).resolves.toBe(false);
    expect(ws.pendingPermission).toBeNull();
  });

  it('fragt bei "ask" nach und merkt sich ein "immer erlauben"', async () => {
    const host = makeHost();
    setHost(host);
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');

    const p = ws.authorizeFs('write', 'daten.json');
    expect(ws.pendingPermission).toEqual({ op: 'write', path: 'daten.json' });

    ws.answerPermission('allow-always');
    await expect(p).resolves.toBe(true);
    expect(ws.pendingPermission).toBeNull();
    expect(ws.permissionFor('write')).toBe('allow'); // gemerkt
    // Nächster Aufruf ohne Dialog.
    await expect(ws.authorizeFs('write', 'x')).resolves.toBe(true);
  });

  it('lehnt einmalig ab, ohne die Berechtigung zu ändern', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');

    const p = ws.authorizeFs('delete', 'weg.txt');
    ws.answerPermission('deny-once');
    await expect(p).resolves.toBe(false);
    expect(ws.permissionFor('delete')).toBe('ask'); // unverändert
  });

  it('reiht mehrere Anfragen und arbeitet sie nacheinander ab', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');

    const p1 = ws.authorizeFs('write', 'eins');
    const p2 = ws.authorizeFs('delete', 'zwei');
    expect(ws.pendingPermission).toEqual({ op: 'write', path: 'eins' });

    ws.answerPermission('allow-once');
    await expect(p1).resolves.toBe(true);
    expect(ws.pendingPermission).toEqual({ op: 'delete', path: 'zwei' });

    ws.answerPermission('deny-once');
    await expect(p2).resolves.toBe(false);
    expect(ws.pendingPermission).toBeNull();
  });

  it('lädt Berechtigungen aus den Einstellungen', async () => {
    setHost(makeHost({
      loadSettings: vi.fn(async () => ({ recentFolders: ['/neu'], accessRoots: {}, permissions: { '/neu': { write: 'allow' as const } } })),
    }));
    const ws = useWorkspaceStore();
    await ws.init();
    await ws.openFolder('/neu');
    expect(ws.permissionFor('write')).toBe('allow');
  });

  it('lehnt offene Berechtigungsanfragen beim Workspace-Wechsel ab (statt sie hängen zu lassen)', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');

    const p1 = ws.authorizeFs('write', 'eins');
    const p2 = ws.authorizeFs('delete', 'zwei');
    expect(ws.pendingPermission).not.toBeNull();

    await ws.openFolder('/anders');

    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(false);
    expect(ws.pendingPermission).toBeNull();
    // Die Ablehnung gilt nur einmalig — es wird keine Berechtigung gemerkt.
    expect(ws.permissionFor('write')).toBe('ask');
    expect(ws.permissionFor('delete')).toBe('ask');
  });

  it('lädt und verwaltet die Bibliotheks-Freigaben', async () => {
    const host = makeHost({
      loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {}, libWhitelist: ['cdn.jsdelivr.net'] })),
    });
    setHost(host);
    const ws = useWorkspaceStore();
    await ws.init();
    expect(ws.libWhitelist).toEqual(['cdn.jsdelivr.net']);

    ws.addLibPattern('  https://unpkg.com/ ');
    expect(ws.libWhitelist).toEqual(['cdn.jsdelivr.net', 'https://unpkg.com/']);
    ws.addLibPattern('cdn.jsdelivr.net'); // Duplikat wird ignoriert
    expect(ws.libWhitelist).toHaveLength(2);

    ws.removeLibPattern('cdn.jsdelivr.net');
    expect(ws.libWhitelist).toEqual(['https://unpkg.com/']);
    expect(host.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ libWhitelist: ['https://unpkg.com/'] }),
    );
  });

  it('lädt und schaltet den Desktop-Modus (persistiert)', async () => {
    const host = makeHost({
      loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {}, uiMode: 'single' as const })),
    });
    setHost(host);
    const ws = useWorkspaceStore();
    await ws.init();
    expect(ws.uiMode).toBe('single');

    ws.setUiMode('windows');
    expect(ws.uiMode).toBe('windows');
    expect(host.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ uiMode: 'windows' }));
  });

  it('lädt und setzt den Deckel gleichzeitiger Agenten (persistiert, mit Vorgabe)', async () => {
    const host = makeHost({
      loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    });
    setHost(host);
    const ws = useWorkspaceStore();
    await ws.init();
    expect(ws.maxAgents).toBe(2); // Vorgabe, wenn nichts gespeichert ist

    ws.setMaxAgents(4);
    expect(ws.maxAgents).toBe(4);
    expect(host.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ maxAgents: 4 }));

    // Unsinnige Werte werden in den erlaubten Bereich gezogen.
    ws.setMaxAgents(0);
    expect(ws.maxAgents).toBe(1);
    ws.setMaxAgents(99);
    expect(ws.maxAgents).toBe(8);
  });

  describe('setAppIcon', () => {
    it('setzt das Icon auf der Platte und zieht die Kachel sofort nach', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      const icon = await ws.setAppIcon(apps[0].id, '🎯');

      expect(icon).toBe('🎯');
      expect(host.setAppIcon).toHaveBeenCalledWith('/apps', apps[0].id, '🎯');
      expect(ws.apps[0].icon).toBe('🎯');
      expect(ws.apps[0].iconCustom).toBe(true);
      // Kein erneutes Einlesen des Verzeichnisses nötig.
      expect(host.listApps).toHaveBeenCalledTimes(1);
    });

    it('merkt beim Zurücksetzen, dass das Icon wieder vom LLM stammt', async () => {
      setHost(makeHost({
        setAppIcon: vi.fn(async () => ({ ok: true, icon: '🧮' })),
      }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      await ws.setAppIcon(apps[0].id, '🎯');

      expect(await ws.setAppIcon(apps[0].id, null)).toBe('🧮');
      expect(ws.apps[0].icon).toBe('🧮');
      expect(ws.apps[0].iconCustom).toBe(false);
    });

    it('meldet einen Fehler und lässt die Kachel unangetastet', async () => {
      setHost(makeHost({
        setAppIcon: vi.fn(async () => ({ ok: false, error: 'Das Bild ist zu groß.' })),
      }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      const vorher = ws.apps[0].icon;

      expect(await ws.setAppIcon(apps[0].id, 'x')).toBeNull();
      expect(ws.error).toBe('Das Bild ist zu groß.');
      expect(ws.apps[0].icon).toBe(vorher);
    });
  });

  describe('Kachel-Positionen', () => {
    it('lädt die gemerkten Positionen des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          iconPositions: { '/apps': { 'a-1': { x: 300, y: 100 } }, '/andere': { 'b-2': { x: 0, y: 0 } } },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.iconLayout).toEqual({}); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.iconLayout).toEqual({ 'a-1': { x: 300, y: 100 } });
    });

    it('merkt eine abgelegte Kachel je Workspace und speichert sie', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      ws.setIconPosition('a-1', { x: 240, y: 60 });

      expect(ws.iconLayout).toEqual({ 'a-1': { x: 240, y: 60 } });
      expect(ws.hasIconLayout).toBe(true);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ iconPositions: { '/apps': { 'a-1': { x: 240, y: 60 } } } }),
      );
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      ws.setIconPosition('a-1', { x: 10, y: 10 });
      expect(ws.iconPositions).toEqual({});
    });

    it('räumt nur den aktuellen Workspace ins Raster zurück', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.iconPositions = { '/andere': { 'x-9': { x: 5, y: 5 } } };
      await ws.openFolder('/apps');
      ws.setIconPosition('a-1', { x: 240, y: 60 });

      ws.resetIconPositions();

      expect(ws.iconLayout).toEqual({});
      expect(ws.hasIconLayout).toBe(false);
      expect(ws.iconPositions).toEqual({ '/andere': { 'x-9': { x: 5, y: 5 } } });
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ iconPositions: { '/andere': { 'x-9': { x: 5, y: 5 } } } }),
      );
    });

    it('vergisst die Position einer gelöschten App', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      ws.setIconPosition('a-1', { x: 240, y: 60 });
      ws.setIconPosition('b-2', { x: 10, y: 10 });

      await ws.removeApp('a-1');

      expect(ws.iconLayout).toEqual({ 'b-2': { x: 10, y: 10 } });
    });
  });

  describe('Sitzung (offene Fenster)', () => {
    const fenster = { appId: 'a-1', x: 10, y: 20, w: 300, h: 240, minimized: false, maximized: false };

    it('lädt die gemerkte Sitzung des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          sessions: { '/apps': [fenster], '/andere': [{ ...fenster, appId: 'b-2' }] },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.session).toEqual([]); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.session).toEqual([fenster]);
    });

    it('überliest eine beschädigte Sitzung', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {}, sessions: 'kaputt' } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.sessions).toEqual({});
    });

    it('merkt die Sitzung je Workspace und speichert sie', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.sessions = { '/andere': [{ ...fenster, appId: 'x-9' }] };
      await ws.openFolder('/apps');

      ws.saveSession([fenster]);

      expect(ws.session).toEqual([fenster]);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ sessions: { '/andere': [{ ...fenster, appId: 'x-9' }], '/apps': [fenster] } }),
      );
    });

    it('schreibt eine unveränderte Sitzung nicht noch einmal', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      ws.saveSession([fenster]);
      const writes = (host.saveSettings as ReturnType<typeof vi.fn>).mock.calls.length;

      ws.saveSession([{ ...fenster }]);

      expect((host.saveSettings as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(writes);
    });

    it('vergisst eine leer gewordene Sitzung (alle Fenster zu)', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      ws.saveSession([fenster]);

      ws.saveSession([]);

      expect(ws.sessions).toEqual({});
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      ws.saveSession([fenster]);
      expect(ws.sessions).toEqual({});
    });
  });

  it('verlässt das Verzeichnis über closeFolder', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');
    ws.closeFolder();
    expect(ws.folder).toBeNull();
    expect(ws.apps).toEqual([]);
  });
});
