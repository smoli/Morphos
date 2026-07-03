import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from './app';
import { setHost } from '@/services/host';
import type { AppData, GenerateResult, MorphosHost, SourceFile, VersionInfo } from '@/types';

const DOC = (body: string, title = 'Test', icon = '🧪'): string =>
  `<!DOCTYPE html><html><head><title>${title}</title><meta name="morphos:icon" content="${icon}"></head><body>${body}</body></html>`;

const FILES = (html: string, extra: SourceFile[] = []): SourceFile[] => [
  { path: 'src/index.html', content: html },
  ...extra,
];

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(DOC('x')), html: DOC('x') })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => null),
    saveApp: vi.fn(async () => ({ ok: true })),
    saveChat: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    listVersions: vi.fn(async (): Promise<VersionInfo[]> => []),
    revertApp: vi.fn(async () => ({ ok: true })),
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
    expect(store.files).toEqual([]);
    expect(store.versions).toEqual([]);
    expect(store.currentHtml).toBe('');
    expect(store.id).toBeNull();
    expect(store.isDraft).toBe(true);
    expect(store.hasApp).toBe(false);
    expect(store.versionCount).toBe(0);
    expect(store.activeSha).toBeNull();
  });

  it('leitet Name, Icon und Id aus der ersten Version ab und committet mit dem Wunsch', async () => {
    const doc = DOC('calc', 'Taschenrechner', '🧮');
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(doc), html: doc })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(host.generate).toHaveBeenCalledWith('Ein Taschenrechner', [], [], []);
    expect(store.name).toBe('Taschenrechner');
    expect(store.icon).toBe('🧮');
    expect(store.id).toMatch(/^taschenrechner-/);
    expect(store.isDraft).toBe(false);
    expect(store.files).toHaveLength(1);
    expect(store.currentHtml).toContain('calc');
    expect(host.saveApp).toHaveBeenCalledOnce();
    const [folderArg, dataArg, messageArg] = (host.saveApp as unknown as { mock: { calls: [string, AppData, string][] } }).mock.calls[0];
    expect(folderArg).toBe('/apps');
    expect(dataArg.id).toBe(store.id);
    expect(dataArg.files).toHaveLength(1);
    expect(dataArg.html).toContain('calc');
    expect(messageArg).toBe('Ein Taschenrechner');
  });

  it('übergibt saveApp ein serialisierbares (nicht-reaktives) Objekt', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    const [, dataArg] = (host.saveApp as unknown as { mock: { calls: [string, AppData, string][] } }).mock.calls[0];
    // Würde bei einem Vue-Proxy über die Electron-IPC scheitern ("could not be cloned").
    expect(() => structuredClone(dataArg)).not.toThrow();
  });

  it('lädt nach dem Speichern die Versionshistorie', async () => {
    const versions: VersionInfo[] = [{ sha: 'abc', prompt: 'Ein Taschenrechner', time: 5 }];
    const host = makeHost({ listVersions: vi.fn(async () => versions) });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(host.listVersions).toHaveBeenCalledWith('/apps', store.id);
    expect(store.versions).toEqual(versions);
    expect(store.activeSha).toBe('abc');
  });

  it('meldet einen Fehler, wenn das Speichern fehlschlägt', async () => {
    const host = makeHost({ saveApp: vi.fn(async () => ({ ok: false, error: 'Platte voll' })) });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(store.error).toBe('Platte voll');
  });

  it('behält Id und Name bei Folgeänderungen und sendet die aktuellen Quelldateien mit', async () => {
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        n += 1;
        const doc = DOC(`v${n}`, 'App', '🧩');
        return { ok: true, files: FILES(doc, [{ path: 'src/app.js', content: `// v${n}` }]), html: doc };
      }),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('erste Version');
    const id = store.id;
    await store.generate('zweite Version');

    const secondCall = (host.generate as unknown as { mock: { calls: [string, SourceFile[]][] } }).mock.calls[1];
    expect(secondCall[0]).toBe('zweite Version');
    expect(secondCall[1].map((f) => f.path)).toEqual(['src/index.html', 'src/app.js']);
    expect(secondCall[1][0].content).toContain('v1');
    expect(store.id).toBe(id);
    expect(store.currentHtml).toContain('v2');
  });

  it('führt den Dialog: Nutzer- und Antwort-Nachrichten landen im Chat und werden gespeichert', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(store.chat).toHaveLength(2);
    expect(store.chat[0]).toMatchObject({ role: 'user', text: 'Ein Taschenrechner' });
    expect(store.chat[1].role).toBe('assistant');
    expect(host.saveChat).toHaveBeenCalledWith('/apps', store.id, expect.any(Array));
  });

  it('reicht den bisherigen Dialog (ohne den aktuellen Wunsch) an den Host weiter', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('erste');
    await store.generate('zweite');

    const secondCall = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[1];
    const chatArg = secondCall[2] as { role: string; text: string }[];
    expect(chatArg.map((m) => m.text)).toEqual(['erste', 'Umgesetzt.']);
    expect(chatArg.map((m) => m.text)).not.toContain('zweite');
  });

  it('behandelt eine reine Rückfrage: kein Speichern, Frage im Chat, pendingQuestion gesetzt', async () => {
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, say: 'Welche Art von Spiel?' })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Spiel');

    expect(store.pendingQuestion).toBe('Welche Art von Spiel?');
    expect(store.chat).toHaveLength(2);
    expect(store.chat[1]).toMatchObject({ role: 'assistant', text: 'Welche Art von Spiel?' });
    expect(store.isDraft).toBe(true);
    expect(host.saveApp).not.toHaveBeenCalled();
    expect(host.saveChat).not.toHaveBeenCalled(); // Entwurf hat noch keinen Ordner
    expect(store.error).toBeNull();
  });

  it('löst die Rückfrage bei der nächsten Generierung mit Änderungen auf', async () => {
    let call = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        call += 1;
        if (call === 1) return { ok: true, say: 'Snake oder Tetris?' };
        return { ok: true, files: FILES(DOC('snake', 'Snake', '🐍')), html: DOC('snake', 'Snake', '🐍'), say: 'Snake ist fertig.' };
      }),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Spiel');
    expect(store.pendingQuestion).toBeTruthy();

    await store.generate('Snake bitte');

    expect(store.pendingQuestion).toBeNull();
    expect(store.name).toBe('Snake');
    expect(store.chat.map((m) => m.text)).toEqual(['Ein Spiel', 'Snake oder Tetris?', 'Snake bitte', 'Snake ist fertig.']);
  });

  it('vermerkt Referenzdateien in der Nutzer-Nachricht und reicht sie an den Host weiter', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Nutze diese Vorlage', [{ path: '/tmp/vorlage.png', name: 'vorlage.png', kind: 'image' }]);

    const call = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call[3]).toEqual([{ path: '/tmp/vorlage.png', name: 'vorlage.png', kind: 'image' }]);
    expect(store.chat[0].attachments).toEqual(['vorlage.png']);
  });

  it('verweigert leere Eingaben und ruft den Host nicht auf', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('   ');

    expect(host.generate).not.toHaveBeenCalled();
    expect(store.error).toBeTruthy();
    expect(store.files).toHaveLength(0);
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
    expect(store.files).toHaveLength(0);
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

  it('stellt über revertTo eine frühere Version wieder her und lädt neu', async () => {
    const restored: AppData = {
      id: 'app-1',
      name: 'App',
      icon: '🧩',
      createdAt: 1,
      updatedAt: 9,
      files: FILES('<html>alt</html>'),
      html: '<html>alt</html>',
      chat: [],
    };
    const host = makeHost({
      loadApp: vi.fn(async () => restored),
      listVersions: vi.fn(async () => [
        { sha: 'neu', prompt: 'Zurück zu: erste', time: 9 },
        { sha: 'alt', prompt: 'erste', time: 1 },
      ]),
    });
    setHost(host);
    const store = useAppStore();
    store.folder = '/apps';
    store.id = 'app-1';

    await store.revertTo('alt');

    expect(host.revertApp).toHaveBeenCalledWith('/apps', 'app-1', 'alt');
    expect(host.loadApp).toHaveBeenCalledWith('/apps', 'app-1');
    expect(store.currentHtml).toBe('<html>alt</html>');
    expect(store.activeSha).toBe('neu');
  });

  it('meldet einen Fehler, wenn die Wiederherstellung scheitert', async () => {
    const host = makeHost({ revertApp: vi.fn(async () => ({ ok: false, error: 'weg' })) });
    setHost(host);
    const store = useAppStore();
    store.folder = '/apps';
    store.id = 'app-1';

    await store.revertTo('xyz');

    expect(store.error).toBe('weg');
  });

  it('öffnet eine bestehende App samt Quelldateien und Versionen', async () => {
    const data: AppData = {
      id: 'editor-abc12',
      name: 'Editor',
      icon: '📝',
      createdAt: 1,
      updatedAt: 2,
      files: FILES('<html>2</html>', [{ path: 'src/app.js', content: 'x' }]),
      html: '<html>2</html>',
      chat: [{ role: 'user', text: 'b', time: 2 }],
    };
    const versions: VersionInfo[] = [
      { sha: 'b', prompt: 'b', time: 2 },
      { sha: 'a', prompt: 'a', time: 1 },
    ];
    const host = makeHost({ loadApp: vi.fn(async () => data), listVersions: vi.fn(async () => versions) });
    setHost(host);
    const store = useAppStore();

    const ok = await store.open('/apps', 'editor-abc12');

    expect(ok).toBe(true);
    expect(host.loadApp).toHaveBeenCalledWith('/apps', 'editor-abc12');
    expect(store.id).toBe('editor-abc12');
    expect(store.name).toBe('Editor');
    expect(store.files).toHaveLength(2);
    expect(store.currentHtml).toBe('<html>2</html>');
    expect(store.versions).toEqual(versions);
  });

  it('lädt nach mehreren Änderungen beim erneuten Öffnen die zuletzt gespeicherte Version', async () => {
    // Persistenz durch eine einfache In-Memory-"Platte" nachbilden.
    const disk = new Map<string, AppData>();
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        n += 1;
        const doc = DOC(`v${n}`, 'Flow', '🧩');
        return { ok: true, files: FILES(doc), html: doc };
      }),
      saveApp: vi.fn(async (_folder, appData: AppData) => { disk.set(appData.id, appData); return { ok: true }; }),
      loadApp: vi.fn(async (_folder, id: string) => disk.get(id) ?? null),
    });
    setHost(host);

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

    expect(reopened.currentHtml).toContain('v3');
    expect(reopened.files).toHaveLength(1);
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
