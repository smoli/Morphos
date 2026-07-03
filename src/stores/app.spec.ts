import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from './app';
import { setHost } from '@/services/host';
import type { MorphosHost, GenerateResult, AppData } from '@/types';

const DOC = (body: string, title = 'Test', icon = '🧪'): string =>
  `<!DOCTYPE html><html><head><title>${title}</title><meta name="morphos:icon" content="${icon}"></head><body>${body}</body></html>`;

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, html: DOC('x') })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => null),
    saveApp: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...overrides,
  };
}

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hat einen leeren Ausgangszustand', () => {
    const store = useAppStore();
    expect(store.history).toEqual([]);
    expect(store.currentHtml).toBe('');
    expect(store.id).toBeNull();
    expect(store.isDraft).toBe(true);
    expect(store.hasApp).toBe(false);
    expect(store.historyCount).toBe(0);
  });

  it('leitet Name, Icon und Id aus der ersten Version ab und speichert sie', async () => {
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, html: DOC('calc', 'Taschenrechner', '🧮') })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(host.generate).toHaveBeenCalledWith('Ein Taschenrechner', '');
    expect(store.name).toBe('Taschenrechner');
    expect(store.icon).toBe('🧮');
    expect(store.id).toMatch(/^taschenrechner-/);
    expect(store.isDraft).toBe(false);
    expect(store.history).toHaveLength(1);
    expect(store.currentHtml).toContain('calc');
    expect(host.saveApp).toHaveBeenCalledOnce();
    const [folderArg, dataArg] = (host.saveApp as unknown as { mock: { calls: [string, AppData][] } }).mock.calls[0];
    expect(folderArg).toBe('/apps');
    expect(dataArg.id).toBe(store.id);
    expect(dataArg.history).toHaveLength(1);
  });

  it('übergibt saveApp ein serialisierbares (nicht-reaktives) Objekt', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    const [, dataArg] = (host.saveApp as unknown as { mock: { calls: [string, AppData][] } }).mock.calls[0];
    // Würde bei einem Vue-Proxy über die Electron-IPC scheitern ("could not be cloned").
    expect(() => structuredClone(dataArg)).not.toThrow();
  });

  it('meldet einen Fehler, wenn das Speichern fehlschlägt', async () => {
    const host = makeHost({ saveApp: vi.fn(async () => ({ ok: false, error: 'Platte voll' })) });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(store.error).toBe('Platte voll');
  });

  it('behält Id und Name bei Folgeänderungen und sendet den aktuellen Stand mit', async () => {
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => { n += 1; return { ok: true, html: DOC(`v${n}`, 'App', '🧩') }; }),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('erste Version');
    const id = store.id;
    await store.generate('zweite Version');

    expect(host.generate).toHaveBeenNthCalledWith(2, 'zweite Version', expect.stringContaining('v1'));
    expect(store.id).toBe(id);
    expect(store.history).toHaveLength(2);
    expect(store.currentHtml).toContain('v2');
  });

  it('verweigert leere Eingaben und ruft den Host nicht auf', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('   ');

    expect(host.generate).not.toHaveBeenCalled();
    expect(store.error).toBeTruthy();
    expect(store.history).toHaveLength(0);
  });

  it('setzt einen Fehler, wenn der Host einen Fehler meldet', async () => {
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: false, error: 'CLI nicht gefunden' })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('irgendwas');

    expect(store.error).toBe('CLI nicht gefunden');
    expect(store.history).toHaveLength(0);
    expect(store.busy).toBe(false);
    expect(host.saveApp).not.toHaveBeenCalled();
  });

  it('fängt geworfene Ausnahmen des Hosts ab', async () => {
    const host = makeHost({
      generate: vi.fn(async () => { throw new Error('Boom'); }),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('irgendwas');

    expect(store.error).toContain('Boom');
    expect(store.busy).toBe(false);
  });

  it('springt über revertTo zu einer früheren Version zurück', async () => {
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => { n += 1; return { ok: true, html: DOC(`v${n}`) }; }),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('a');
    const firstId = store.history[0].id;
    await store.generate('b');
    expect(store.currentHtml).toContain('v2');

    store.revertTo(firstId);
    expect(store.currentHtml).toContain('v1');
    expect(store.activeId).toBe(firstId);
  });

  it('ignoriert revertTo mit unbekannter id', async () => {
    setHost(makeHost());
    const store = useAppStore();
    store.newDraft('/apps');
    await store.generate('a');
    const before = store.currentHtml;

    store.revertTo('gibt-es-nicht');
    expect(store.currentHtml).toBe(before);
  });

  it('öffnet eine bestehende App aus dem Verzeichnis', async () => {
    const data: AppData = {
      id: 'editor-abc12',
      name: 'Editor',
      icon: '📝',
      createdAt: 1,
      updatedAt: 2,
      activeId: 'v2',
      history: [
        { id: 'v1', prompt: 'a', html: '<html>1</html>', time: 1 },
        { id: 'v2', prompt: 'b', html: '<html>2</html>', time: 2 },
      ],
    };
    const host = makeHost({ loadApp: vi.fn(async () => data) });
    setHost(host);
    const store = useAppStore();

    const ok = await store.open('/apps', 'editor-abc12');

    expect(ok).toBe(true);
    expect(host.loadApp).toHaveBeenCalledWith('/apps', 'editor-abc12');
    expect(store.id).toBe('editor-abc12');
    expect(store.name).toBe('Editor');
    expect(store.icon).toBe('📝');
    expect(store.history).toHaveLength(2);
    expect(store.currentHtml).toBe('<html>2</html>');
    expect(store.activeId).toBe('v2');
  });

  it('lädt nach mehreren Änderungen beim erneuten Öffnen die zuletzt gespeicherte Version', async () => {
    // Persistenz durch eine einfache In-Memory-"Platte" nachbilden.
    const disk = new Map<string, AppData>();
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => { n += 1; return { ok: true, html: DOC(`v${n}`, 'Flow', '🧩') }; }),
      saveApp: vi.fn(async (_folder, appData: AppData) => { disk.set(appData.id, appData); return { ok: true }; }),
      loadApp: vi.fn(async (_folder, id: string) => disk.get(id) ?? null),
    });
    setHost(host);

    // App erzeugen und dreimal weiterentwickeln.
    const editor = useAppStore();
    editor.newDraft('/apps');
    await editor.generate('erste Version');
    const id = editor.id!;
    await editor.generate('zweite Version');
    await editor.generate('dritte Version');
    expect(editor.currentHtml).toContain('v3');

    // Frischer Store (wie „Desktop → zurück in die App“) lädt von der Platte.
    setActivePinia(createPinia());
    const reopened = useAppStore();
    await reopened.open('/apps', id);

    expect(reopened.history).toHaveLength(3);
    expect(reopened.currentHtml).toContain('v3');
    expect(reopened.activeId).toBe(editor.history[2].id);
  });

  it('meldet einen Fehler, wenn die App nicht geladen werden kann', async () => {
    const host = makeHost({ loadApp: vi.fn(async () => null) });
    setHost(host);
    const store = useAppStore();

    const ok = await store.open('/apps', 'weg');
    expect(ok).toBe(false);
    expect(store.error).toBeTruthy();
  });

  it('leert den Fehler über clearError', () => {
    const store = useAppStore();
    store.error = 'x';
    store.clearError();
    expect(store.error).toBeNull();
  });
});
