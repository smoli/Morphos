import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkspaceStore } from './workspace';
import { setHost } from '@/services/host';
import { DEFAULT_WALLPAPER } from '@/core/wallpaper';
import { DEFAULT_DOCK_BLUR, DEFAULT_DOCK_TRANSPARENCY } from '@/core/transparency';
import { DEFAULT_DOCK_AUTOHIDE, DEFAULT_DOCK_EDGE } from '@/core/dock';
import { DEFAULT_TILE_CHROME_HIDE, DEFAULT_TILE_GAP, MAX_TILE_GAP } from '@/core/tilesettings';
import { leaf, split } from '@/core/tiling';
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
    expect(host.saveSettings).toHaveBeenCalledWith({ recentFolders: ['/neu', '/alt'], accessRoots: {}, permissions: {}, libWhitelist: [], uiMode: 'windows', maxAgents: 2, iconPositions: {}, favorites: {}, sessions: {}, tileLayouts: {}, tileGaps: {}, tileChromeHides: {}, wallpapers: {}, dockTransparencies: {}, dockBlurs: {}, dockAutohides: {}, dockEdges: {} });
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

  describe('App aus einem Git-Repository holen (c0074)', () => {
    const collision = {
      token: 'import-1',
      id: 'a-1',
      name: 'A aus dem Netz',
      existingName: 'A',
      copyId: 'a-1-2',
    };

    it('reicht die Adresse zum Hauptprozess und liest das Verzeichnis neu ein', async () => {
      const host = makeHost({ importApp: vi.fn(async () => ({ ok: true, id: 'c-3', name: 'C' })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      const res = await ws.importApp('https://example.org/c.git');

      expect(res).toMatchObject({ ok: true, id: 'c-3' });
      expect(host.importApp).toHaveBeenCalledWith('/apps', 'https://example.org/c.git');
      // Einmal beim Öffnen, einmal nach dem Import — die neue App ist da.
      expect(host.listApps).toHaveBeenCalledTimes(2);
    });

    it('liest bei einer Rückfrage NICHT neu ein — noch ist nichts passiert', async () => {
      const host = makeHost({ importApp: vi.fn(async () => ({ ok: false, collision })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      const res = await ws.importApp('https://example.org/a.git');

      expect(res.collision).toEqual(collision);
      expect(host.listApps).toHaveBeenCalledTimes(1);
    });

    it('führt die Antwort aus und liest danach neu ein', async () => {
      const host = makeHost({
        resolveImport: vi.fn(async () => ({ ok: true, id: 'a-1-2', name: 'A aus dem Netz' })),
      });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      const res = await ws.resolveImport('import-1', 'copy');

      expect(res).toMatchObject({ ok: true, id: 'a-1-2' });
      expect(host.resolveImport).toHaveBeenCalledWith('import-1', 'copy');
      expect(host.listApps).toHaveBeenCalledTimes(2);
    });

    it('meldet einen Fehler des Hauptprozesses weiter', async () => {
      setHost(makeHost({ importApp: vi.fn(async () => ({ ok: false, error: 'Kein Zugriff.' })) }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.importApp('https://example.org/geheim.git')).toEqual({ ok: false, error: 'Kein Zugriff.' });
    });

    it('fängt einen geworfenen Fehler ab', async () => {
      setHost(makeHost({
        importApp: vi.fn(async () => {
          throw new Error('Brücke weg');
        }),
      }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.importApp('https://example.org/a.git')).toEqual({ ok: false, error: 'Brücke weg' });
    });

    it('verlangt ein offenes Arbeitsverzeichnis', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect((await ws.importApp('https://example.org/a.git')).ok).toBe(false);
    });

    it('kommt ohne die Anbindung aus (Renderer-Test)', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect((await ws.importApp('https://example.org/a.git')).error).toBeTruthy();
      expect((await ws.resolveImport('import-1', 'copy')).error).toBeTruthy();
    });
  });

  describe('Readme einer App (c0077)', () => {
    it('reicht Ordner und App-Id zum Hauptprozess weiter', async () => {
      const host = makeHost({ createReadme: vi.fn(async () => ({ ok: true })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.createReadme('rechner-1')).toEqual({ ok: true });
      expect(host.createReadme).toHaveBeenCalledWith('/apps', 'rechner-1');
    });

    it('reicht durch, dass schon ein Readme dasteht (c0080)', async () => {
      setHost(makeHost({ createReadme: vi.fn(async () => ({ ok: true, existed: true })) }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.createReadme('rechner-1')).toEqual({ ok: true, existed: true });
    });

    it('meldet einen Fehler des Hauptprozesses weiter', async () => {
      setHost(makeHost({ createReadme: vi.fn(async () => ({ ok: false, error: 'Kein Manifest.' })) }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.createReadme('rechner-1')).toEqual({ ok: false, error: 'Kein Manifest.' });
    });

    it('fängt einen geworfenen Fehler ab', async () => {
      setHost(makeHost({
        createReadme: vi.fn(async () => {
          throw new Error('Brücke weg');
        }),
      }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.createReadme('rechner-1')).toEqual({ ok: false, error: 'Brücke weg' });
    });

    it('verlangt ein offenes Arbeitsverzeichnis und die Anbindung', async () => {
      setHost(makeHost({ createReadme: vi.fn(async () => ({ ok: true })) }));
      const ws = useWorkspaceStore();
      expect((await ws.createReadme('rechner-1')).ok).toBe(false);

      setHost(makeHost());
      const ohne = useWorkspaceStore();
      await ohne.openFolder('/apps');
      expect((await ohne.createReadme('rechner-1')).error).toBeTruthy();
    });
  });

  describe('Abgleich mit der Gegenstelle (c0082)', () => {
    const synced = { hasRemote: true, url: 'https://example.org/a.git', upstream: 'origin/main', ahead: 0, behind: 0 };

    it('sieht auf Geheiß bei der Gegenstelle nach und merkt sich den Stand', async () => {
      const host = makeHost({ remoteStatus: vi.fn(async () => ({ ...synced, ahead: 2 })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      const status = await ws.refreshRemote('a-1');

      expect(status).toMatchObject({ ahead: 2 });
      expect(host.remoteStatus).toHaveBeenCalledWith('/apps', 'a-1', true);
      expect(ws.remoteOf('a-1')).toMatchObject({ ahead: 2 });
      expect(ws.remoteOf('b-2')).toBe(null);
    });

    it('kann auch ohne Holen nachsehen (kein Netzverkehr)', async () => {
      const host = makeHost({ remoteStatus: vi.fn(async () => synced) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      await ws.refreshRemote('a-1', false);
      expect(host.remoteStatus).toHaveBeenCalledWith('/apps', 'a-1', false);
    });

    it('schiebt und übernimmt den zurückgemeldeten Stand', async () => {
      const host = makeHost({ pushApp: vi.fn(async () => ({ ok: true, status: synced })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.pushApp('a-1')).toMatchObject({ ok: true });
      expect(host.pushApp).toHaveBeenCalledWith('/apps', 'a-1');
      expect(ws.remoteOf('a-1')).toMatchObject({ ahead: 0, behind: 0 });
      // Am Ordner hat sich nichts geändert — kein erneutes Einlesen.
      expect(host.listApps).toHaveBeenCalledTimes(1);
    });

    it('reicht die Absage des Hauptprozesses durch, samt Stand', async () => {
      const abgelehnt = { ...synced, ahead: 1, behind: 2 };
      setHost(makeHost({
        pushApp: vi.fn(async () => ({ ok: false, status: abgelehnt, error: 'erst ziehen (Pull)' })),
      }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect((await ws.pushApp('a-1')).error).toMatch(/ziehen/);
      expect(ws.remoteOf('a-1')).toMatchObject({ ahead: 1, behind: 2 });
    });

    it('liest nach einem geglückten Ziehen das Verzeichnis neu ein', async () => {
      const host = makeHost({ pullApp: vi.fn(async () => ({ ok: true, changed: true, status: synced })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.pullApp('a-1')).toMatchObject({ ok: true, changed: true });
      expect(host.listApps).toHaveBeenCalledTimes(2);
    });

    it('liest nicht neu ein, wenn nichts zu ziehen war', async () => {
      const host = makeHost({
        pullApp: vi.fn(async () => ({ ok: false, status: synced, error: 'Auf der Gegenstelle steht nichts Neues.' })),
      });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      await ws.pullApp('a-1');
      expect(host.listApps).toHaveBeenCalledTimes(1);
    });

    it('vergisst den Stand beim Wechsel des Verzeichnisses und beim Löschen', async () => {
      setHost(makeHost({ remoteStatus: vi.fn(async () => synced) }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      await ws.refreshRemote('a-1');
      await ws.refreshRemote('b-2');

      await ws.removeApp('a-1');
      expect(ws.remoteOf('a-1')).toBe(null);
      expect(ws.remoteOf('b-2')).not.toBe(null);

      await ws.openFolder('/andere');
      expect(ws.remoteOf('b-2')).toBe(null);
    });

    it('fängt einen geworfenen Fehler ab', async () => {
      setHost(makeHost({
        remoteStatus: vi.fn(async () => { throw new Error('Brücke weg'); }),
        pushApp: vi.fn(async () => { throw new Error('Brücke weg'); }),
      }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.refreshRemote('a-1')).toMatchObject({ error: 'Brücke weg' });
      expect(await ws.pushApp('a-1')).toEqual({ ok: false, error: 'Brücke weg' });
    });

    it('verlangt ein offenes Arbeitsverzeichnis und die Anbindung', async () => {
      setHost(makeHost({ remoteStatus: vi.fn(async () => synced) }));
      const ohneOrdner = useWorkspaceStore();
      expect(await ohneOrdner.refreshRemote('a-1')).toBe(null);
      expect((await ohneOrdner.pushApp('a-1')).ok).toBe(false);

      setActivePinia(createPinia());
      setHost(makeHost());
      const ohneBrücke = useWorkspaceStore();
      await ohneBrücke.openFolder('/apps');
      expect(await ohneBrücke.refreshRemote('a-1')).toBe(null);
      expect((await ohneBrücke.pushApp('a-1')).error).toBeTruthy();
      expect((await ohneBrücke.pullApp('a-1')).error).toBeTruthy();
    });
  });

  describe('Arbeitsverzeichnis öffnen (c0075)', () => {
    it('reicht den Ordner zum Dateimanager des Systems weiter', async () => {
      const host = makeHost({ revealFolder: vi.fn(async () => ({ ok: true })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.revealFolder()).toEqual({ ok: true });
      expect(host.revealFolder).toHaveBeenCalledWith('/apps');
    });

    it('reicht den Ordner zum Terminal weiter', async () => {
      const host = makeHost({ openTerminal: vi.fn(async () => ({ ok: true })) });
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.openTerminal()).toEqual({ ok: true });
      expect(host.openTerminal).toHaveBeenCalledWith('/apps');
    });

    it('meldet einen Fehler des Hauptprozesses weiter', async () => {
      setHost(makeHost({ openTerminal: vi.fn(async () => ({ ok: false, error: 'Kein Terminal gefunden.' })) }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.openTerminal()).toEqual({ ok: false, error: 'Kein Terminal gefunden.' });
    });

    it('fängt einen geworfenen Fehler ab', async () => {
      setHost(makeHost({
        revealFolder: vi.fn(async () => {
          throw new Error('Brücke weg');
        }),
      }));
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(await ws.revealFolder()).toEqual({ ok: false, error: 'Brücke weg' });
    });

    it('verlangt ein offenes Arbeitsverzeichnis', async () => {
      setHost(makeHost({ revealFolder: vi.fn(async () => ({ ok: true })) }));
      const ws = useWorkspaceStore();

      expect((await ws.revealFolder()).ok).toBe(false);
      expect((await ws.openTerminal()).ok).toBe(false);
    });

    it('kommt ohne die Anbindung aus (Renderer-Test)', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect((await ws.revealFolder()).error).toBeTruthy();
      expect((await ws.openTerminal()).error).toBeTruthy();
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

  describe('Lieblings-Apps (im Dock behalten)', () => {
    it('lädt die gemerkten Lieblinge des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          favorites: { '/apps': ['a-1'], '/andere': ['x-9'] },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.favoriteIds).toEqual([]); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.favoriteIds).toEqual(['a-1']);
      expect(ws.isFavorite('a-1')).toBe(true);
      expect(ws.isFavorite('b-2')).toBe(false);
    });

    it('nimmt eine App je Workspace dazu und wieder heraus und speichert sie', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      ws.toggleFavorite('a-1');

      expect(ws.favoriteIds).toEqual(['a-1']);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ favorites: { '/apps': ['a-1'] } }),
      );

      ws.toggleFavorite('a-1');

      expect(ws.favoriteIds).toEqual([]);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ favorites: {} }),
      );
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      ws.toggleFavorite('a-1');
      expect(ws.favorites).toEqual({});
    });

    it('vergisst die gelöschte App, lässt andere Verzeichnisse stehen', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      ws.favorites = { '/andere': ['a-1'] };
      await ws.openFolder('/apps');
      ws.toggleFavorite('a-1');
      ws.toggleFavorite('b-2');

      await ws.removeApp('a-1');

      expect(ws.favoriteIds).toEqual(['b-2']);
      expect(ws.favorites['/andere']).toEqual(['a-1']);
    });
  });

  describe('Hintergrund (Wallpaper)', () => {
    const blau = { kind: 'color' as const, color: '#123456' };

    it('lädt den gemerkten Hintergrund des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          wallpapers: { '/apps': blau, '/andere': { kind: 'color' as const, color: '#abcdef' } },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.wallpaper).toEqual(DEFAULT_WALLPAPER); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.wallpaper).toEqual(blau);
      expect(ws.hasWallpaper).toBe(true);
    });

    it('gilt die Vorgabe, solange keiner gewählt ist', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      expect(ws.wallpaper).toEqual(DEFAULT_WALLPAPER);
      expect(ws.hasWallpaper).toBe(false);
    });

    it('merkt einen gewählten Hintergrund je Workspace und speichert ihn', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setWallpaper({ kind: 'gradient', from: '#000', to: '#FFF', angle: 400 })).toBe(true);

      // Beim Merken schon eingetütet: ausgeschriebene Farben, Winkel im Kreis.
      expect(ws.wallpaper).toEqual({ kind: 'gradient', from: '#000000', to: '#ffffff', angle: 40 });
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          wallpapers: { '/apps': { kind: 'gradient', from: '#000000', to: '#ffffff', angle: 40 } },
        }),
      );
    });

    it('nimmt keinen unbrauchbaren Hintergrund an', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      const calls = (host.saveSettings as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(ws.setWallpaper({ kind: 'color', color: 'blau' } as never)).toBe(false);

      expect(ws.hasWallpaper).toBe(false);
      expect((host.saveSettings as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(calls);
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect(ws.setWallpaper(blau)).toBe(false);
      expect(ws.wallpapers).toEqual({});
    });

    it('setzt nur den aktuellen Workspace auf die Vorgabe zurück', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.wallpapers = { '/andere': { kind: 'color', color: '#abcdef' } };
      await ws.openFolder('/apps');
      ws.setWallpaper(blau);

      ws.resetWallpaper();

      expect(ws.wallpaper).toEqual(DEFAULT_WALLPAPER);
      expect(ws.hasWallpaper).toBe(false);
      expect(ws.wallpapers).toEqual({ '/andere': { kind: 'color', color: '#abcdef' } });
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ wallpapers: { '/andere': { kind: 'color', color: '#abcdef' } } }),
      );
    });

    it('überlebt beschädigte Einstellungen (dann gilt die Vorgabe)', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          wallpapers: { '/apps': { kind: 'image', image: 'https://example.com/x.png' } } as never,
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      await ws.openFolder('/apps');
      expect(ws.wallpaper).toEqual(DEFAULT_WALLPAPER);
    });
  });

  describe('Durchsichtigkeit des Docks', () => {
    it('lädt den gemerkten Wert des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockTransparencies: { '/apps': 0.6, '/andere': 0.1 },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.dockTransparency).toBe(DEFAULT_DOCK_TRANSPARENCY); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.dockTransparency).toBe(0.6);
      expect(ws.hasDockTransparency).toBe(true);
    });

    it('gilt die Vorgabe, solange keiner gewählt ist', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      expect(ws.dockTransparency).toBe(DEFAULT_DOCK_TRANSPARENCY);
      expect(ws.hasDockTransparency).toBe(false);
    });

    it('merkt einen gewählten Wert je Workspace und speichert ihn', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setDockTransparency(0.653)).toBe(true);

      expect(ws.dockTransparency).toBe(0.65); // beim Merken schon gerundet
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockTransparencies: { '/apps': 0.65 } }),
      );
    });

    it('nimmt keinen unbrauchbaren Wert an', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      const calls = (host.saveSettings as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(ws.setDockTransparency(1.4)).toBe(false);

      expect(ws.hasDockTransparency).toBe(false);
      expect((host.saveSettings as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(calls);
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect(ws.setDockTransparency(0.5)).toBe(false);
      expect(ws.dockTransparencies).toEqual({});
    });

    it('setzt nur den aktuellen Workspace auf die Vorgabe zurück', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.dockTransparencies = { '/andere': 0.1 };
      await ws.openFolder('/apps');
      ws.setDockTransparency(0.8);

      ws.resetDockTransparency();

      expect(ws.dockTransparency).toBe(DEFAULT_DOCK_TRANSPARENCY);
      expect(ws.hasDockTransparency).toBe(false);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockTransparencies: { '/andere': 0.1 } }),
      );
    });

    it('überlebt beschädigte Einstellungen (dann gilt die Vorgabe)', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockTransparencies: { '/apps': 'viel' },
        } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      await ws.openFolder('/apps');
      expect(ws.dockTransparency).toBe(DEFAULT_DOCK_TRANSPARENCY);
    });
  });

  describe('Milchglas-Schleier des Docks', () => {
    it('lädt den gemerkten Wert des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockBlurs: { '/apps': 22, '/andere': 4 },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.dockBlur).toBe(DEFAULT_DOCK_BLUR); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.dockBlur).toBe(22);
      expect(ws.hasDockBlur).toBe(true);
    });

    it('gilt die Vorgabe, solange keiner gewählt ist', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      expect(ws.dockBlur).toBe(DEFAULT_DOCK_BLUR);
      expect(ws.hasDockBlur).toBe(false);
    });

    it('merkt einen gewählten Wert je Workspace und speichert ihn', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setDockBlur(8.6)).toBe(true);

      expect(ws.dockBlur).toBe(9); // beim Merken schon gerundet
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockBlurs: { '/apps': 9 } }),
      );
    });

    it('nimmt keinen unbrauchbaren Wert an', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      const calls = (host.saveSettings as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(ws.setDockBlur(999)).toBe(false);

      expect(ws.hasDockBlur).toBe(false);
      expect((host.saveSettings as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(calls);
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect(ws.setDockBlur(10)).toBe(false);
      expect(ws.dockBlurs).toEqual({});
    });

    it('setzt nur den aktuellen Workspace auf die Vorgabe zurück', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.dockBlurs = { '/andere': 4 };
      await ws.openFolder('/apps');
      ws.setDockBlur(25);

      ws.resetDockBlur();

      expect(ws.dockBlur).toBe(DEFAULT_DOCK_BLUR);
      expect(ws.hasDockBlur).toBe(false);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockBlurs: { '/andere': 4 } }),
      );
    });

    it('überlebt beschädigte Einstellungen (dann gilt die Vorgabe)', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockBlurs: { '/apps': 'dicht' },
        } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      await ws.openFolder('/apps');
      expect(ws.dockBlur).toBe(DEFAULT_DOCK_BLUR);
    });
  });

  describe('Ausblenden des Docks', () => {
    it('lädt die gemerkte Entscheidung des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockAutohides: { '/apps': true },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.dockAutohide).toBe(DEFAULT_DOCK_AUTOHIDE); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.dockAutohide).toBe(true);
    });

    it('gilt die Vorgabe, solange nichts entschieden ist', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      expect(ws.dockAutohide).toBe(DEFAULT_DOCK_AUTOHIDE);
    });

    it('merkt das Ausblenden je Workspace und speichert es', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setDockAutohide(true)).toBe(true);

      expect(ws.dockAutohide).toBe(true);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockAutohides: { '/apps': true } }),
      );
    });

    it('merkt die Vorgabe gar nicht erst — ein Verzeichnis ohne Eintrag ist genau das', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.dockAutohides = { '/andere': true };
      await ws.openFolder('/apps');
      ws.setDockAutohide(true);

      expect(ws.setDockAutohide(false)).toBe(true);

      expect(ws.dockAutohide).toBe(false);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockAutohides: { '/andere': true } }),
      );
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect(ws.setDockAutohide(true)).toBe(false);
      expect(ws.dockAutohides).toEqual({});
    });

    it('überlebt beschädigte Einstellungen (dann gilt die Vorgabe)', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockAutohides: { '/apps': 'ja' },
        } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      await ws.openFolder('/apps');
      expect(ws.dockAutohide).toBe(DEFAULT_DOCK_AUTOHIDE);
    });
  });

  describe('Rand des Docks', () => {
    it('lädt den gemerkten Rand des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockEdges: { '/apps': 'left' as const },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.dockEdge).toBe(DEFAULT_DOCK_EDGE); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.dockEdge).toBe('left');
    });

    it('gilt die Vorgabe, solange nichts gewählt ist', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      expect(ws.dockEdge).toBe(DEFAULT_DOCK_EDGE);
    });

    it('merkt den Rand je Workspace und speichert ihn', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setDockEdge('right')).toBe(true);

      expect(ws.dockEdge).toBe('right');
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockEdges: { '/apps': 'right' } }),
      );
    });

    it('merkt die Vorgabe gar nicht erst — ein Verzeichnis ohne Eintrag steht unten', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.dockEdges = { '/andere': 'top' };
      await ws.openFolder('/apps');
      ws.setDockEdge('left');

      expect(ws.setDockEdge(DEFAULT_DOCK_EDGE)).toBe(true);

      expect(ws.dockEdge).toBe(DEFAULT_DOCK_EDGE);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ dockEdges: { '/andere': 'top' } }),
      );
    });

    it('nimmt keinen Rand an, den es nicht gibt', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setDockEdge('schräg' as never)).toBe(false);

      expect(ws.dockEdges).toEqual({});
      expect(ws.dockEdge).toBe(DEFAULT_DOCK_EDGE);
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect(ws.setDockEdge('left')).toBe(false);
      expect(ws.dockEdges).toEqual({});
    });

    it('überlebt beschädigte Einstellungen (dann gilt die Vorgabe)', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          dockEdges: { '/apps': 'schräg' },
        } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      await ws.openFolder('/apps');
      expect(ws.dockEdge).toBe(DEFAULT_DOCK_EDGE);
    });
  });

  describe('Fuge des Kachel-Verbunds (c0072)', () => {
    it('lädt die gemerkte Fuge des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          tileGaps: { '/apps': 24, '/andere': 4 },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.tileGap).toBe(DEFAULT_TILE_GAP); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.tileGap).toBe(24);
      expect(ws.hasTileGap).toBe(true);
    });

    it('gilt die Vorgabe, solange keine gewählt ist', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      expect(ws.tileGap).toBe(DEFAULT_TILE_GAP);
      expect(ws.hasTileGap).toBe(false);
    });

    it('merkt eine gewählte Fuge je Workspace und speichert sie', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setTileGap(19.6)).toBe(true);

      expect(ws.tileGap).toBe(20); // beim Merken schon gerundet
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ tileGaps: { '/apps': 20 } }),
      );
    });

    it('nimmt keine unbrauchbare Fuge an', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      const calls = (host.saveSettings as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(ws.setTileGap(MAX_TILE_GAP + 1)).toBe(false);

      expect(ws.hasTileGap).toBe(false);
      expect((host.saveSettings as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(calls);
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect(ws.setTileGap(20)).toBe(false);
      expect(ws.tileGaps).toEqual({});
    });

    it('setzt nur den aktuellen Workspace auf die Vorgabe zurück', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.tileGaps = { '/andere': 4 };
      await ws.openFolder('/apps');
      ws.setTileGap(30);

      ws.resetTileGap();

      expect(ws.tileGap).toBe(DEFAULT_TILE_GAP);
      expect(ws.hasTileGap).toBe(false);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ tileGaps: { '/andere': 4 } }),
      );
    });

    it('überlebt beschädigte Einstellungen (dann gilt die Vorgabe)', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          tileGaps: { '/apps': 'weit' },
        } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      await ws.openFolder('/apps');
      expect(ws.tileGap).toBe(DEFAULT_TILE_GAP);
    });
  });

  describe('Fensterrahmen im Kachel-Modus (c0072)', () => {
    it('lädt die gemerkte Entscheidung des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          tileChromeHides: { '/apps': true },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.tileChromeHidden).toBe(DEFAULT_TILE_CHROME_HIDE); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.tileChromeHidden).toBe(true);
    });

    it('gilt die Vorgabe, solange nichts entschieden ist', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      expect(ws.tileChromeHidden).toBe(DEFAULT_TILE_CHROME_HIDE);
    });

    it('merkt das Weglegen je Workspace und speichert es', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');

      expect(ws.setTileChromeHidden(true)).toBe(true);

      expect(ws.tileChromeHidden).toBe(true);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ tileChromeHides: { '/apps': true } }),
      );
    });

    it('merkt die Vorgabe gar nicht erst — ein Verzeichnis ohne Eintrag ist genau das', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.tileChromeHides = { '/andere': true };
      await ws.openFolder('/apps');
      ws.setTileChromeHidden(true);

      expect(ws.setTileChromeHidden(false)).toBe(true);

      expect(ws.tileChromeHidden).toBe(false);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ tileChromeHides: { '/andere': true } }),
      );
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      expect(ws.setTileChromeHidden(true)).toBe(false);
      expect(ws.tileChromeHides).toEqual({});
    });

    it('überlebt beschädigte Einstellungen (dann gilt die Vorgabe)', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          tileChromeHides: { '/apps': 'ja' },
        } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      await ws.openFolder('/apps');
      expect(ws.tileChromeHidden).toBe(DEFAULT_TILE_CHROME_HIDE);
    });
  });

  describe('Kachel-Anordnung (c0068)', () => {
    const baum = split('row', leaf('app:a-1'), leaf('app:b-2'), 0.4);

    it('lädt den gemerkten Baum des Workspace', async () => {
      setHost(makeHost({
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          tileLayouts: { '/apps': baum, '/andere': leaf('app:b-2') },
        })),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.tileLayout).toBeNull(); // noch kein Ordner geöffnet
      await ws.openFolder('/apps');
      expect(ws.tileLayout).toEqual(baum);
    });

    it('überliest einen beschädigten Baum', async () => {
      setHost(makeHost({
        // Beschädigte Einstellungen von der Platte — der Typ lügt hier absichtlich.
        loadSettings: vi.fn(async () => ({
          recentFolders: [],
          accessRoots: {},
          tileLayouts: { '/apps': 'kaputt' },
        } as unknown as Settings)),
      }));
      const ws = useWorkspaceStore();
      await ws.init();
      expect(ws.tileLayouts).toEqual({});
    });

    it('merkt den Baum je Workspace und speichert ihn', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      ws.tileLayouts = { '/andere': leaf('app:x-9') };
      await ws.openFolder('/apps');

      ws.saveTileLayout(baum);

      expect(ws.tileLayout).toEqual(baum);
      expect(host.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ tileLayouts: { '/andere': leaf('app:x-9'), '/apps': baum } }),
      );
    });

    it('schreibt einen unveränderten Baum nicht noch einmal', async () => {
      const host = makeHost();
      setHost(host);
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      ws.saveTileLayout(baum);
      const writes = (host.saveSettings as ReturnType<typeof vi.fn>).mock.calls.length;

      ws.saveTileLayout(split('row', leaf('app:a-1'), leaf('app:b-2'), 0.4));

      expect((host.saveSettings as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(writes);
    });

    it('vergisst einen leer gewordenen Baum (alle Kacheln zu)', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      await ws.openFolder('/apps');
      ws.saveTileLayout(baum);

      ws.saveTileLayout(null);

      expect(ws.tileLayouts).toEqual({});
    });

    it('rührt ohne geöffneten Ordner nichts an', async () => {
      setHost(makeHost());
      const ws = useWorkspaceStore();
      ws.saveTileLayout(baum);
      expect(ws.tileLayouts).toEqual({});
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
