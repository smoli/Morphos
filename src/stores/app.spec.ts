import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppWindow } from './app';
import { setHost } from '@/services/host';
// Jeder Test bekommt eine frische Pinia — dieselbe Instanz-Id ist damit isoliert.
const useAppStore = () => useAppWindow('test');
import type { AgentEvent, AppData, GenerateResult, MorphosHost, SourceFile, VersionInfo } from '@/types';

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
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async (): Promise<VersionInfo[]> => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...overrides,
  };
}

/**
 * Host, der während der Generierung Fortschrittsereignisse meldet — wie die
 * Claude CLI im Strom-Modus. `foreignRunId` schickt sie unter einer fremden
 * Lauf-Id (darf den Store nicht erreichen), `fail` lässt den Lauf scheitern.
 */
function makeStreamingHost(events: AgentEvent[], opts: { foreignRunId?: boolean; fail?: boolean } = {}) {
  const listeners = new Set<(runId: string, event: AgentEvent) => void>();
  const host = makeHost({
    onAgentEvent: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    generate: vi.fn(async (_p, _f, _d, _c, _a, runId?: string): Promise<GenerateResult> => {
      const id = opts.foreignRunId ? 'anderer-lauf' : (runId ?? '');
      for (const event of events) for (const cb of listeners) cb(id, event);
      if (opts.fail) return { ok: false, error: 'Fehlgeschlagen.' };
      return { ok: true, files: FILES(DOC('x')), html: DOC('x') };
    }),
  });
  return { host, listenerCount: (): number => listeners.size };
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

    expect(host.generate).toHaveBeenCalledWith(
      'Ein Taschenrechner',
      [],
      { concept: '', userdoc: '' },
      [],
      [],
      expect.any(String),
    );
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
    const chatArg = secondCall[3] as { role: string; text: string }[];
    expect(chatArg.map((m) => m.text)).toEqual(['erste', 'Umgesetzt.']);
    expect(chatArg.map((m) => m.text)).not.toContain('zweite');
  });

  describe('Konzept und Anleitung', () => {
    const DOCS = { concept: '# Rechner\nRechnet.', userdoc: '# Anleitung\nZahl tippen.' };

    it('übernimmt die Dokumente der Generierung und speichert sie mit', async () => {
      const doc = DOC('calc');
      const host = makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(doc), html: doc, docs: DOCS })),
      });
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');

      expect(store.docs).toEqual(DOCS);
      expect(store.hasDocs).toBe(true);
      const [, dataArg] = (host.saveApp as unknown as { mock: { calls: [string, AppData, string][] } }).mock.calls[0];
      expect(dataArg.docs).toEqual(DOCS);
    });

    it('reicht den aktuellen Stand der Dokumente an die nächste Generierung weiter', async () => {
      const doc = DOC('calc');
      const host = makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(doc), html: doc, docs: DOCS })),
      });
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');
      await store.generate('Mit Prozenttaste');

      const secondCall = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[1];
      expect(secondCall[2]).toEqual(DOCS);
    });

    it('lädt die Dokumente beim Öffnen einer App mit', async () => {
      const host = makeHost({
        loadApp: vi.fn(async (): Promise<AppData> => ({
          id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2,
          files: FILES(DOC('calc')), html: DOC('calc'), chat: [], docs: DOCS,
        })),
      });
      setHost(host);
      const store = useAppStore();

      await store.open('/apps', 'rechner-1');

      expect(store.docs).toEqual(DOCS);
    });

    it('bleibt bei einem Alt-Stand ohne Dokumente leer', async () => {
      const host = makeHost({
        loadApp: vi.fn(async (): Promise<AppData> => ({
          id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2,
          files: FILES(DOC('calc')), html: DOC('calc'), chat: [],
        })),
      });
      setHost(host);
      const store = useAppStore();

      await store.open('/apps', 'rechner-1');

      expect(store.docs).toEqual({ concept: '', userdoc: '' });
      expect(store.hasDocs).toBe(false);
    });

    it('rührt die Dokumente bei einer reinen Rückfrage nicht an', async () => {
      let call = 0;
      const host = makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => {
          call += 1;
          if (call === 1) return { ok: true, files: FILES(DOC('calc')), html: DOC('calc'), docs: DOCS };
          return { ok: true, say: 'Wie genau meinst du das?' };
        }),
      });
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');
      await store.generate('Mach es schöner');

      expect(store.pendingQuestion).toBeTruthy();
      expect(store.docs).toEqual(DOCS);
    });
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

  it('sammelt die Fortschrittsereignisse des laufenden Laufs', async () => {
    const stream = makeStreamingHost([
      { kind: 'start' },
      { kind: 'think' },
      { kind: 'write', path: 'src/index.html' },
      { kind: 'done' },
    ]);
    setHost(stream.host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(store.activity).toEqual([
      { kind: 'start' },
      { kind: 'think' },
      { kind: 'write', path: 'src/index.html' },
      { kind: 'done' },
    ]);
  });

  it('hält den Startzeitpunkt des Laufs fest und gibt ihn danach wieder frei', async () => {
    let duringRun: number | null = -1;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        duringRun = store.runStartedAt;
        return { ok: true, files: FILES(DOC('x')), html: DOC('x') };
      }),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');
    expect(store.runStartedAt).toBeNull();

    const before = Date.now();
    await store.generate('Ein Taschenrechner');

    expect(duringRun).not.toBeNull();
    expect(duringRun!).toBeGreaterThanOrEqual(before);
    expect(store.runStartedAt).toBeNull();
  });

  it('nimmt nur die Ereignisse des eigenen Laufs an', async () => {
    const stream = makeStreamingHost([{ kind: 'start' }], { foreignRunId: true });
    setHost(stream.host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(store.activity).toEqual([]);
  });

  it('führt gleich lautende Ereignisse nicht doppelt auf', async () => {
    const stream = makeStreamingHost([{ kind: 'think' }, { kind: 'think' }, { kind: 'think' }]);
    setHost(stream.host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(store.activity).toEqual([{ kind: 'think' }]);
  });

  it('meldet sich nach dem Lauf wieder ab und beginnt den Fortschritt neu', async () => {
    const stream = makeStreamingHost([{ kind: 'start' }]);
    setHost(stream.host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('erste Version');
    expect(store.activity).toHaveLength(1);
    expect(stream.listenerCount()).toBe(0);

    await store.generate('zweite Version');
    expect(store.activity).toEqual([{ kind: 'start' }]); // nicht angehäuft
  });

  it('meldet sich auch nach einem Fehler wieder ab', async () => {
    const stream = makeStreamingHost([], { fail: true });
    setHost(stream.host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    expect(store.error).toBeTruthy();
    expect(stream.listenerCount()).toBe(0);
  });

  it('vermerkt Referenzdateien in der Nutzer-Nachricht und reicht sie an den Host weiter', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Nutze diese Vorlage', [{ path: '/tmp/vorlage.png', name: 'vorlage.png', kind: 'image' }]);

    const call = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call[4]).toEqual([{ path: '/tmp/vorlage.png', name: 'vorlage.png', kind: 'image' }]);
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

  describe('Abbrechen eines Laufs', () => {
    it('beendet den Kindprozess über die Lauf-Id und verwirft das Ergebnis', async () => {
      const cancelAgent = vi.fn(async () => true);
      let runIdDuringRun: string | null = null;
      const host = makeHost({
        cancelAgent,
        generate: vi.fn(async (): Promise<GenerateResult> => {
          runIdDuringRun = store.runId;
          store.abortRun();
          return { ok: true, files: FILES(DOC('neu')), html: DOC('neu') };
        }),
      });
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');

      expect(runIdDuringRun).toBeTruthy();
      expect(cancelAgent).toHaveBeenCalledWith(runIdDuringRun);
      // Nichts übernommen, nichts gespeichert, kein Fehler — und wieder frei.
      expect(store.currentHtml).toBe('');
      expect(store.isDraft).toBe(true);
      expect(host.saveApp).not.toHaveBeenCalled();
      expect(store.error).toBeNull();
      expect(store.busy).toBe(false);
      expect(store.runId).toBeNull();
      expect(store.aborted).toBe(false);
    });

    it('nimmt den abgebrochenen Wunsch wieder aus dem Dialog', async () => {
      const host = makeHost({
        cancelAgent: vi.fn(async () => true),
        generate: vi.fn(async (): Promise<GenerateResult> => {
          store.abortRun();
          return { ok: false, error: 'Abgebrochen' };
        }),
      });
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');
      store.chat.push({ role: 'user', text: 'früher', time: 1 });

      await store.generate('doch nicht');

      expect(store.chat.map((m) => m.text)).toEqual(['früher']);
    });

    it('bricht ohne laufenden Lauf nichts ab', () => {
      const host = makeHost({ cancelAgent: vi.fn(async () => true) });
      setHost(host);
      const store = useAppStore();

      store.abortRun();

      expect(host.cancelAgent).not.toHaveBeenCalled();
      expect(store.aborted).toBe(false);
    });
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

  describe('eigenes Icon', () => {
    it('übernimmt beim Öffnen, dass das Icon vom Anwender stammt', async () => {
      const data: AppData = {
        id: 'editor-abc12', name: 'Editor', icon: '🎯', iconCustom: true,
        createdAt: 1, updatedAt: 2, files: FILES('<html>x</html>'), html: '<html>x</html>', chat: [],
      };
      setHost(makeHost({ loadApp: vi.fn(async () => data) }));
      const store = useAppStore();

      await store.open('/apps', 'editor-abc12');

      expect(store.icon).toBe('🎯');
      expect(store.iconCustom).toBe(true);
    });

    it('lässt eine Generierung das eigene Icon NICHT überschreiben', async () => {
      const doc = DOC('calc', 'Rechner', '🧮');
      setHost(makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(doc), html: doc })),
      }));
      const store = useAppStore();
      store.newDraft('/apps');
      store.applyIcon('🎯', true);

      await store.generate('Ein Taschenrechner');

      expect(store.icon).toBe('🎯');
      expect(store.iconCustom).toBe(true);
    });

    it('nimmt das Icon des LLM, solange der Anwender keines gesetzt hat', async () => {
      const doc = DOC('calc', 'Rechner', '🧮');
      setHost(makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(doc), html: doc })),
      }));
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');

      expect(store.icon).toBe('🧮');
      expect(store.iconCustom).toBe(false);
    });

    it('schickt das Merkmal mit ins Manifest — es überlebt jede Generierung', async () => {
      const host = makeHost();
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');
      store.applyIcon('🎯', true);

      await store.generate('Ein Taschenrechner');

      const [, dataArg] = (host.saveApp as unknown as { mock: { calls: [string, AppData, string][] } }).mock.calls[0];
      expect(dataArg.icon).toBe('🎯');
      expect(dataArg.iconCustom).toBe(true);
    });
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

  describe('Chat auf Zuruf (Composer)', () => {
    it('bleibt bei einer geöffneten App zunächst zu', async () => {
      setHost(makeHost({
        loadApp: vi.fn(async (): Promise<AppData> => ({
          id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2,
          files: FILES(DOC('calc')), html: DOC('calc'), chat: [],
        })),
      }));
      const store = useAppStore();
      expect(store.composerOpen).toBe(false);

      await store.open('/apps', 'rechner-1');
      expect(store.composerOpen).toBe(false);
    });

    it('öffnet und schließt ihn auf Zuruf', () => {
      const store = useAppStore();
      store.toggleComposer();
      expect(store.composerOpen).toBe(true);
      store.toggleComposer();
      expect(store.composerOpen).toBe(false);

      store.openComposer();
      store.openComposer();
      expect(store.composerOpen).toBe(true);
      store.closeComposer();
      expect(store.composerOpen).toBe(false);
    });

    it('steht bei einem neuen Entwurf von Anfang an offen (er hat noch nichts zu zeigen)', () => {
      const store = useAppStore();
      store.newDraft('/apps');
      expect(store.composerOpen).toBe(true);
    });

    it('geht bei einer Rückfrage des LLM von selbst auf', async () => {
      setHost(makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, say: 'Welche Art von Spiel?' })),
      }));
      const store = useAppStore();
      store.newDraft('/apps');
      store.closeComposer();

      await store.generate('Ein Spiel');

      expect(store.pendingQuestion).toBe('Welche Art von Spiel?');
      expect(store.composerOpen).toBe(true);
    });

    it('geht ohne Rückfrage nicht von selbst auf (das führt die Warteanzeige vor)', async () => {
      setHost(makeHost());
      const store = useAppStore();
      store.newDraft('/apps');
      store.closeComposer();

      await store.generate('Ein Rechner');

      expect(store.composerOpen).toBe(false);
    });
  });
});
