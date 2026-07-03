import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkspaceStore } from './workspace';
import { setHost } from '@/services/host';
import type { MorphosHost, AppSummary } from '@/types';

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
    expect(host.saveSettings).toHaveBeenCalledWith({ recentFolders: ['/neu', '/alt'], accessRoots: {}, permissions: {}, libWhitelist: [] });
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

  it('verlässt das Verzeichnis über closeFolder', async () => {
    setHost(makeHost());
    const ws = useWorkspaceStore();
    await ws.openFolder('/neu');
    ws.closeFolder();
    expect(ws.folder).toBeNull();
    expect(ws.apps).toEqual([]);
  });
});
