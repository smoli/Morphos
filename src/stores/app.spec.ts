import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppWindow } from './app';
import { setHost } from '@/services/host';
// Jeder Test bekommt eine frische Pinia — dieselbe Instanz-Id ist damit isoliert.
const useAppStore = () => useAppWindow('test');
import type { AgentEvent, AppData, AppSnapshot, ElementRef, GenerateResult, MorphosHost, SourceFile, VersionInfo } from '@/types';
import { DEFAULT_BLOCK_NAME, emptyDesign, type Design } from '@/core/design';

const DOC = (body: string, title = 'Test', icon = '🧪'): string =>
  `<!DOCTYPE html><html><head><title>${title}</title><meta name="morphos:icon" content="${icon}"></head><body>${body}</body></html>`;

const FILES = (html: string, extra: SourceFile[] = []): SourceFile[] => [
  { path: 'src/index.html', content: html },
  ...extra,
];

/**
 * Der Stand, den der Hauptprozess nach einem Lauf zurückgibt: Er hat die App
 * auf der Platte gelesen, gebündelt und committet (c0087) — hier wird er nur
 * noch übernommen.
 */
const SNAP = (html: string, over: Partial<AppSnapshot> = {}): AppSnapshot => ({
  id: 'test-abc12',
  name: 'Test',
  icon: '🧪',
  createdAt: 1,
  updatedAt: 2,
  files: FILES(html),
  html,
  docs: { concept: '', userdoc: '' },
  ...over,
});

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, app: SNAP(DOC('x')) })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => null),
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
    generate: vi.fn(async (_p, _folder, _id, _c, _a, runId?: string): Promise<GenerateResult> => {
      const id = opts.foreignRunId ? 'anderer-lauf' : (runId ?? '');
      for (const event of events) for (const cb of listeners) cb(id, event);
      if (opts.fail) return { ok: false, error: 'Fehlgeschlagen.' };
      return { ok: true, app: SNAP(DOC('x')) };
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

  it('schickt nur den Wunsch und die Anschrift der App — und übernimmt den Stand des Laufs', async () => {
    const doc = DOC('calc', 'Taschenrechner', '🧮');
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({
        ok: true,
        app: SNAP(doc, { id: 'taschenrechner-abc12', name: 'Taschenrechner', icon: '🧮' }),
      })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Taschenrechner');

    // Ein Entwurf hat noch keine Id — der Ordner entsteht erst im Lauf.
    expect(host.generate).toHaveBeenCalledWith(
      'Ein Taschenrechner',
      '/apps',
      null,
      [],
      [],
      expect.any(String),
      'preact',
      [],
    );
    expect(store.name).toBe('Taschenrechner');
    expect(store.icon).toBe('🧮');
    expect(store.id).toBe('taschenrechner-abc12');
    expect(store.isDraft).toBe(false);
    expect(store.files).toHaveLength(1);
    expect(store.currentHtml).toContain('calc');
  });

  it('übergibt dem Host nur serialisierbare (nicht-reaktive) Werte', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');
    store.chat.push({ role: 'user', text: 'früher', time: 1 });

    await store.generate('Ein Taschenrechner', [], [{ tag: 'button', selector: 'button', text: 'Los' }]);

    const call = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    // Würde bei einem Vue-Proxy über die Electron-IPC scheitern ("could not be cloned").
    expect(() => structuredClone(call)).not.toThrow();
  });

  it('lädt nach dem Lauf die Versionshistorie', async () => {
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

  it('nennt beim zweiten Wunsch die Id der App, statt Dateien mitzuschicken', async () => {
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        n += 1;
        const doc = DOC(`v${n}`, 'App', '🧩');
        return {
          ok: true,
          app: SNAP(doc, {
            id: 'app-abc12',
            name: 'App',
            icon: '🧩',
            files: FILES(doc, [{ path: 'src/app.js', content: `// v${n}` }]),
          }),
        };
      }),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('erste Version');
    const id = store.id;
    await store.generate('zweite Version');

    const secondCall = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[1];
    expect(secondCall[0]).toBe('zweite Version');
    expect(secondCall[1]).toBe('/apps');
    expect(secondCall[2]).toBe('app-abc12');
    expect(store.id).toBe(id);
    expect(store.files.map((f) => f.path)).toEqual(['src/index.html', 'src/app.js']);
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

    it('übernimmt den Stand der Dokumente, den der Lauf zurückmeldet', async () => {
      const doc = DOC('calc');
      const host = makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, app: SNAP(doc, { docs: DOCS }) })),
      });
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');

      expect(store.docs).toEqual(DOCS);
      expect(store.hasDocs).toBe(true);
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
          if (call === 1) return { ok: true, app: SNAP(DOC('calc'), { docs: DOCS }) };
          return { ok: true, question: 'Wie genau meinst du das?' };
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

  it('behandelt eine reine Rückfrage: kein neuer Stand, Frage im Chat, pendingQuestion gesetzt', async () => {
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({
        ok: true,
        say: 'Welche Art von Spiel?',
        question: 'Welche Art von Spiel?',
      })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Ein Spiel');

    expect(store.pendingQuestion).toBe('Welche Art von Spiel?');
    expect(store.chat).toHaveLength(2);
    expect(store.chat[1]).toMatchObject({ role: 'assistant', text: 'Welche Art von Spiel?' });
    expect(store.isDraft).toBe(true);
    expect(store.currentHtml).toBe('');
    expect(host.saveChat).not.toHaveBeenCalled(); // Entwurf hat noch keinen Ordner
    expect(store.error).toBeNull();
  });

  it('nimmt eine Mitteilung ohne Änderung als Antwort in den Chat — ohne Rückfrage', async () => {
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, say: 'Das kann die App bereits.' })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Zahlen addieren');

    expect(store.chat[1]).toMatchObject({ role: 'assistant', text: 'Das kann die App bereits.' });
    expect(store.pendingQuestion).toBeNull();
    expect(store.error).toBeNull();
  });

  it('meldet einen Lauf, der weder etwas geändert noch etwas gesagt hat', async () => {
    setHost(makeHost({ generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true })) }));
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('Irgendwas');

    expect(store.error).toBeTruthy();
    expect(store.isDraft).toBe(true);
  });

  it('löst die Rückfrage bei der nächsten Generierung mit Änderungen auf', async () => {
    let call = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        call += 1;
        if (call === 1) return { ok: true, say: 'Snake oder Tetris?', question: 'Snake oder Tetris?' };
        const doc = DOC('snake', 'Snake', '🐍');
        return { ok: true, app: SNAP(doc, { id: 'snake-abc12', name: 'Snake', icon: '🐍' }), say: 'Snake ist fertig.' };
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
        return { ok: true, app: SNAP(DOC('x')) };
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
          return { ok: true, app: SNAP(DOC('neu')) };
        }),
      });
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');

      expect(runIdDuringRun).toBeTruthy();
      expect(cancelAgent).toHaveBeenCalledWith(runIdDuringRun);
      // Nichts übernommen, kein Fehler — und wieder frei.
      expect(store.currentHtml).toBe('');
      expect(store.isDraft).toBe(true);
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
    // Die "Platte" ist der Hauptprozess: Er schreibt und committet den Stand
    // selbst (c0087) — hier nachgebildet durch das, was generate zurückgibt.
    const disk = new Map<string, AppData>();
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        n += 1;
        const doc = DOC(`v${n}`, 'Flow', '🧩');
        const app = SNAP(doc, { id: 'flow-abc12', name: 'Flow', icon: '🧩' });
        disk.set(app.id, { ...app, chat: [] });
        return { ok: true, app };
      }),
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

    // Welches Icon nach einem Lauf gilt, entscheidet der Hauptprozess am
    // Manifest der App (core/generate) — das Fenster übernimmt es.
    it('übernimmt Icon und dessen Herkunft aus dem Ergebnis des Laufs', async () => {
      const doc = DOC('calc', 'Rechner', '🧮');
      setHost(makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({
          ok: true,
          app: SNAP(doc, { icon: '🎯', iconCustom: true }),
        })),
      }));
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');

      expect(store.icon).toBe('🎯');
      expect(store.iconCustom).toBe(true);
    });

    it('nimmt das Icon des LLM, solange der Anwender keines gesetzt hat', async () => {
      const doc = DOC('calc', 'Rechner', '🧮');
      setHost(makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, app: SNAP(doc, { icon: '🧮' }) })),
      }));
      const store = useAppStore();
      store.newDraft('/apps');

      await store.generate('Ein Taschenrechner');

      expect(store.icon).toBe('🧮');
      expect(store.iconCustom).toBe(false);
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
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, question: 'Welche Art von Spiel?' })),
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

  // c0105: Der Entwurfs-Modus legt den UI-Entwurf (design.ui.json) über die
  // laufende App. Gelesen wird er im Hauptprozess (core/design) — hier kommt
  // der fertige Baum an.
  describe('Entwurfs-Modus (UI-Designer)', () => {
    const DESIGN = {
      version: 1,
      blocks: [{ id: 'b1', name: 'Kopf', rect: { x: 0, y: 0, w: 1, h: 0.2 }, children: [] }],
    };

    /** Eine geöffnete App — nur dann gibt es überhaupt einen Entwurf. */
    async function openedStore(over: Partial<MorphosHost> = {}) {
      setHost(makeHost({
        loadApp: vi.fn(async (): Promise<AppData> => ({
          id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2,
          files: FILES(DOC('calc')), html: DOC('calc'), chat: [],
        })),
        ...over,
      }));
      const store = useAppStore();
      await store.open('/apps', 'rechner-1');
      return store;
    }

    it('ist zunächst zu und ohne Entwurf', async () => {
      const store = await openedStore();
      expect(store.designOpen).toBe(false);
      expect(store.designBlocks).toEqual([]);
    });

    it('liest den Entwurf der App, sobald er aufgeht', async () => {
      const readDesign = vi.fn(async () => DESIGN);
      const store = await openedStore({ readDesign });

      await store.toggleDesign();

      expect(readDesign).toHaveBeenCalledWith('/apps', 'rechner-1');
      expect(store.designOpen).toBe(true);
      expect(store.designBlocks).toEqual(DESIGN.blocks);
    });

    it('schließt wieder — und liest beim nächsten Öffnen frisch von der Platte', async () => {
      const readDesign = vi.fn(async () => DESIGN);
      const store = await openedStore({ readDesign });

      await store.toggleDesign();
      await store.toggleDesign();
      expect(store.designOpen).toBe(false);

      await store.toggleDesign();
      expect(readDesign).toHaveBeenCalledTimes(2);
      expect(store.designOpen).toBe(true);
    });

    it('geht auch ohne Entwurf auf — leer statt gar nicht', async () => {
      const store = await openedStore({ readDesign: vi.fn(async () => ({ version: 1, blocks: [] })) });

      await store.toggleDesign();

      expect(store.designOpen).toBe(true);
      expect(store.designBlocks).toEqual([]);
    });

    it('übersteht einen scheiternden Host und eine fehlende Anbindung', async () => {
      const kaputt = await openedStore({ readDesign: vi.fn(async () => { throw new Error('weg'); }) });
      await kaputt.toggleDesign();
      expect(kaputt.designOpen).toBe(true);
      expect(kaputt.designBlocks).toEqual([]);
      expect(kaputt.error).toBeNull();

      setActivePinia(createPinia());
      const ohne = await openedStore();
      await ohne.toggleDesign();
      expect(ohne.designOpen).toBe(true);
      expect(ohne.designBlocks).toEqual([]);
    });

    it('nimmt einen krummen Baum nicht in den Zustand', async () => {
      const store = await openedStore({
        readDesign: vi.fn(async () => ({ version: 1 } as never)),
      });

      await store.toggleDesign();

      expect(store.designBlocks).toEqual([]);
    });

    it('fragt für einen Entwurf (noch ohne App) gar nicht erst nach', async () => {
      const readDesign = vi.fn(async () => DESIGN);
      setHost(makeHost({ readDesign }));
      const store = useAppStore();
      store.newDraft('/apps');

      await store.toggleDesign();

      expect(readDesign).not.toHaveBeenCalled();
      expect(store.designBlocks).toEqual([]);
    });

    // c0107: Gezeichnet wird im Fenster, geschrieben auf der Platte — der Baum
    // entsteht hier mit den reinen Helfern aus core/design und geht als Ganzes
    // über den Host in die Datei.
    describe('Zeichnen und Benennen (c0107)', () => {
      /** Ein Host, der das Geschriebene festhält und zurechtgerückt zurückgibt. */
      function writingHost() {
        const written: Design[] = [];
        const writeDesign = vi.fn(async (_f: string, _i: string, d: Design) => {
          written.push(JSON.parse(JSON.stringify(d)) as Design);
          return d;
        });
        return { written, writeDesign };
      }

      it('legt einen gezeichneten Kasten an und schreibt ihn auf die Platte', async () => {
        const { written, writeDesign } = writingHost();
        const store = await openedStore({ writeDesign, readDesign: vi.fn(async () => emptyDesign()) });
        await store.openDesign();

        const id = await store.addDesignBlock({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 'Kopf');

        expect(id).toBeTruthy();
        expect(writeDesign).toHaveBeenCalledWith('/apps', 'rechner-1', expect.anything());
        expect(written[0].blocks).toEqual([
          { id, name: 'Kopf', rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, children: [] },
        ]);
        // Und das Fenster zeigt sofort, was in der Datei steht.
        expect(store.designBlocks).toEqual(written[0].blocks);
      });

      it('gibt einem namenlosen Kasten den Platzhalternamen', async () => {
        const { written, writeDesign } = writingHost();
        const store = await openedStore({ writeDesign, readDesign: vi.fn(async () => emptyDesign()) });

        await store.addDesignBlock({ x: 0, y: 0, w: 0.5, h: 0.5 }, '   ');

        expect(written[0].blocks[0].name).toBe(DEFAULT_BLOCK_NAME);
      });

      it('legt den zweiten Kasten neben den ersten, ohne den ersten zu verlieren', async () => {
        const { written, writeDesign } = writingHost();
        const store = await openedStore({ writeDesign, readDesign: vi.fn(async () => emptyDesign()) });

        await store.addDesignBlock({ x: 0, y: 0, w: 0.5, h: 0.2 }, 'Kopf');
        await store.addDesignBlock({ x: 0, y: 0.3, w: 0.5, h: 0.2 }, 'Fuß');

        expect(written[1].blocks.map((b) => b.name)).toEqual(['Kopf', 'Fuß']);
        expect(store.designBlocks).toHaveLength(2);
      });

      it('benennt einen bestehenden Kasten um und schreibt ihn wieder', async () => {
        const { written, writeDesign } = writingHost();
        const store = await openedStore({ writeDesign, readDesign: vi.fn(async () => DESIGN) });
        await store.openDesign();

        await store.renameDesignBlock('b1', 'Kopfzeile');

        expect(written[0].blocks[0].name).toBe('Kopfzeile');
        expect(store.designBlocks[0].name).toBe('Kopfzeile');
      });

      it('nimmt den Entwurf, wie ihn die Platte zurückgibt', async () => {
        // Der Hauptprozess rückt zurecht (core/design) — maßgeblich ist er.
        const writeDesign = vi.fn(async (): Promise<Design> => ({
          version: 1,
          blocks: [{ id: 'gerade', name: 'Kopf', rect: { x: 0, y: 0, w: 1, h: 0.2 }, children: [] }],
        }));
        const store = await openedStore({ writeDesign, readDesign: vi.fn(async () => emptyDesign()) });

        await store.addDesignBlock({ x: 0, y: 0, w: 2, h: 0.2 }, 'Kopf');

        expect(store.designBlocks).toEqual([
          { id: 'gerade', name: 'Kopf', rect: { x: 0, y: 0, w: 1, h: 0.2 }, children: [] },
        ]);
      });

      it('sagt es, wenn der Entwurf nicht gespeichert werden konnte', async () => {
        const store = await openedStore({
          writeDesign: vi.fn(async () => null),
          readDesign: vi.fn(async () => emptyDesign()),
        });

        const id = await store.addDesignBlock({ x: 0, y: 0, w: 0.5, h: 0.5 }, 'Kopf');

        expect(id).toBeNull();
        expect(store.error).toContain('nicht gespeichert');
      });

      it('übersteht einen werfenden Host', async () => {
        const store = await openedStore({
          writeDesign: vi.fn(async () => { throw new Error('Platte voll'); }),
          readDesign: vi.fn(async () => emptyDesign()),
        });

        const id = await store.addDesignBlock({ x: 0, y: 0, w: 0.5, h: 0.5 }, 'Kopf');

        expect(id).toBeNull();
        expect(store.error).toContain('nicht gespeichert');
      });

      // c0108: Ein Kasten sagt mehr als seinen Namen — Rolle und Anweisungen
      // gehen denselben Weg auf die Platte.
      it('schreibt Rolle und Anweisungen eines Kastens', async () => {
        const { written, writeDesign } = writingHost();
        const store = await openedStore({ writeDesign, readDesign: vi.fn(async () => DESIGN) });
        await store.openDesign();

        await store.describeDesignBlock('b1', { type: 'Kopfzeile' });
        await store.describeDesignBlock('b1', { instructions: 'Titel links, Suche rechts' });

        expect(written[1].blocks[0]).toMatchObject({
          type: 'Kopfzeile',
          instructions: 'Titel links, Suche rechts',
        });
        // Der Name bleibt, wovon hier nicht die Rede war.
        expect(written[1].blocks[0].name).toBe(DESIGN.blocks[0].name);
        expect(store.designBlocks[0]).toMatchObject({ type: 'Kopfzeile' });
      });

      it('nimmt einen geleerten Text wieder weg, statt ihn leer zu speichern', async () => {
        const { written, writeDesign } = writingHost();
        const store = await openedStore({
          writeDesign,
          readDesign: vi.fn(async () => ({
            version: 1,
            blocks: [{
              id: 'b1', name: 'Kopf', type: 'Kopfzeile', instructions: 'weg damit',
              rect: { x: 0, y: 0, w: 1, h: 0.2 }, children: [],
            }],
          })),
        });
        await store.openDesign();

        await store.describeDesignBlock('b1', { type: '  ' });
        await store.describeDesignBlock('b1', { instructions: '' });

        expect('type' in written[1].blocks[0]).toBe(false);
        expect('instructions' in written[1].blocks[0]).toBe(false);
      });

      it('beschreibt keinen Kasten ohne Entwurf', async () => {
        const { writeDesign } = writingHost();
        const store = await openedStore({ writeDesign, readDesign: vi.fn(async () => emptyDesign()) });

        await store.describeDesignBlock('b1', { type: 'Kopfzeile' });

        expect(writeDesign).not.toHaveBeenCalled();
        expect(store.error).toBeNull();
      });

      it('zeichnet nicht in einen Entwurf ohne App', async () => {
        const { writeDesign } = writingHost();
        setHost(makeHost({ writeDesign }));
        const store = useAppStore();
        store.newDraft('/apps');

        expect(await store.addDesignBlock({ x: 0, y: 0, w: 0.5, h: 0.5 }, 'Kopf')).toBeNull();
        expect(writeDesign).not.toHaveBeenCalled();
        expect(store.error).toBeNull();
      });
    });
  });

  describe('Framework-Wahl', () => {
    /** Das Framework-Argument des letzten generate-Aufrufs. */
    const frameworkOf = (host: MorphosHost): unknown =>
      (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![6];

    it('legt eine neue App mit Preact an, ohne dass jemand danach fragen muss', async () => {
      const host = makeHost();
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');

      expect(store.newFramework).toBe('preact');
      await store.generate('Ein Zähler');

      expect(frameworkOf(host)).toBe('preact');
    });

    it('reicht die abgewählte Preact-Wahl an den Hauptprozess durch', async () => {
      const host = makeHost();
      setHost(host);
      const store = useAppStore();
      store.newDraft('/apps');
      store.newFramework = 'vanilla';

      await store.generate('Ein Zähler');

      expect(frameworkOf(host)).toBe('vanilla');
    });

    it('setzt die Wahl mit jedem neuen Entwurf auf die Vorgabe zurück', () => {
      setHost(makeHost());
      const store = useAppStore();
      store.newFramework = 'vanilla';

      store.newDraft('/apps');

      expect(store.newFramework).toBe('preact');
    });
  });
});

describe('useAppWindow — markierte Elemente', () => {
  const REF: ElementRef = { tag: 'button', selector: 'body > button#go', text: 'Los', source: 'src/index.html:5:3' };

  it('schickt sie mit dem Wunsch an den Host und vermerkt sie im Verlauf', async () => {
    const doc = DOC('x');
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, app: SNAP(doc) })),
    });
    setHost(host);
    const store = useAppStore();
    store.newDraft('/apps');

    await store.generate('mach das größer', [], [REF]);

    const call = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call[call.length - 1]).toEqual([REF]);
    expect(store.chat[0].elements).toEqual(['<button> „Los“']);
  });
});
