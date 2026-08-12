import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAgentsStore } from './agents';
import { useDesktopStore } from './desktop';
import { useWorkspaceStore } from './workspace';
import { useAppWindow } from './app';
import { useNotificationsStore } from './notifications';
import { MAX_RECENT_RUNS } from '@/core/queue';
import { setHost } from '@/services/host';
import type { AppData, GenerateResult, MorphosHost, SourceFile } from '@/types';

const DOC = (t = 'Rechner', icon = '🧮', body = 'x'): string =>
  `<!DOCTYPE html><html><head><title>${t}</title><meta name="morphos:icon" content="${icon}"></head><body>${body}</body></html>`;
const FILES = (html = DOC()): SourceFile[] => [{ path: 'src/index.html', content: html }];

/** Ein von außen auflösbarer Lauf — damit lässt sich die Reihung prüfen. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function makeHost(over: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, files: FILES(), html: DOC() })),
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
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...over,
  };
}

/**
 * Host, dessen Läufe erst auf Zuruf enden. `release(n)` gibt den n-ten Lauf
 * (Reihenfolge des Aufrufs) frei — so lässt sich beobachten, was gleichzeitig
 * läuft und was wartet.
 */
function makeSlowHost(over: Partial<MorphosHost> = {}) {
  const gates: { resolve: (v: GenerateResult) => void }[] = [];
  const prompts: string[] = [];
  const host = makeHost({
    generate: vi.fn(async (prompt: string): Promise<GenerateResult> => {
      prompts.push(prompt);
      const gate = deferred<GenerateResult>();
      gates.push(gate);
      return gate.promise;
    }),
    ...over,
  });
  return {
    host,
    prompts,
    started: (): number => gates.length,
    async release(index: number, result?: GenerateResult): Promise<void> {
      gates[index].resolve(result ?? { ok: true, files: FILES(), html: DOC() });
      await flush();
    },
  };
}

/** Lässt die anhängigen Mikrotasks durchlaufen (die Läufe sind Promise-Ketten). */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 200; i += 1) await Promise.resolve();
};

/** Ein Fenster mit eigenem Instanz-Store, wie es die Oberfläche anlegt. */
function openWindow(appId: string | null, name = 'App'): string {
  const desktop = useDesktopStore();
  const id = appId ? desktop.openApp(appId, { title: name, icon: '🧩' }) : desktop.openDraft();
  const store = useAppWindow(id);
  store.newDraft('/apps');
  if (appId) {
    store.id = appId;
    store.name = name;
    store.currentHtml = DOC(name);
    store.files = FILES(DOC(name));
  }
  return id;
}

describe('useAgentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().folder = '/apps';
  });

  it('beginnt leer', () => {
    const agents = useAgentsStore();
    expect(agents.jobs).toEqual([]);
    expect(agents.count).toBe(0);
  });

  it('trägt die markierten Elemente des Wunsches bis in die Generierung', async () => {
    const host = makeHost();
    setHost(host);
    const agents = useAgentsStore();
    const win = openWindow('a-1', 'A');
    const ref = { tag: 'button', selector: 'body > button#go', text: 'Los' };

    agents.submit(win, 'mach das größer', [], [ref]);
    await flush();

    const call = (host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call[call.length - 1]).toEqual([ref]);
  });

  describe('Deckel und Warteschlange', () => {
    it('startet bis zum Deckel und reiht den Rest ein', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');
      const b = openWindow('b-2', 'B');
      const c = openWindow('c-3', 'C');

      agents.submit(a, 'eins');
      agents.submit(b, 'zwei');
      agents.submit(c, 'drei');
      await flush();

      expect(slow.started()).toBe(2); // Vorgabe: zwei gleichzeitig
      expect(agents.count).toBe(3);
      expect(agents.runningJobs).toHaveLength(2);
      expect(agents.queuedJobs.map((j) => j.prompt)).toEqual(['drei']);
    });

    it('startet den nächsten Wunsch, sobald ein Platz frei wird (FIFO)', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');
      const b = openWindow('b-2', 'B');
      const c = openWindow('c-3', 'C');

      agents.submit(a, 'eins');
      agents.submit(b, 'zwei');
      agents.submit(c, 'drei');
      await flush();
      await slow.release(0);

      expect(slow.prompts).toEqual(['eins', 'zwei', 'drei']);
      expect(agents.count).toBe(2);
    });

    it('folgt dem eingestellten Deckel, auch wenn er eins ist', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      useWorkspaceStore().maxAgents = 1;
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');
      const b = openWindow('b-2', 'B');

      agents.submit(a, 'eins');
      agents.submit(b, 'zwei');
      await flush();

      expect(slow.started()).toBe(1);
      await slow.release(0);
      expect(slow.started()).toBe(2);
    });

    it('lässt für eine App nie zwei Agenten gleichzeitig laufen', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');

      agents.submit(a, 'eins');
      agents.submit(a, 'zwei');
      await flush();

      expect(slow.started()).toBe(1);
      expect(agents.queuedJobs).toHaveLength(1);
    });

    it('führt den zweiten Wunsch einer App gegen ihren aktualisierten Stand aus', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');

      agents.submit(a, 'eins');
      agents.submit(a, 'zwei');
      await flush();
      await slow.release(0, { ok: true, files: FILES(DOC('A', '🧮', 'v2')), html: DOC('A', '🧮', 'v2') });

      expect(slow.prompts).toEqual(['eins', 'zwei']);
      const secondCall = (slow.host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[1];
      expect((secondCall[1] as SourceFile[])[0].content).toContain('v2');
      // Der Dialog des ersten Laufs ist Kontext des zweiten.
      expect((secondCall[3] as { text: string }[]).map((m) => m.text)).toEqual(['eins', 'Umgesetzt.']);
    });

    it('meldet eine App mit laufendem oder wartendem Auftrag als beschäftigt', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');

      expect(agents.isBusy('a-1')).toBe(false);
      agents.submit(a, 'eins');
      await flush();
      expect(agents.isBusy('a-1')).toBe(true);
      expect(agents.isWindowBusy(a)).toBe(true);

      await slow.release(0);
      expect(agents.isBusy('a-1')).toBe(false);
    });
  });

  describe('Abbrechen', () => {
    it('nimmt einen wartenden Wunsch aus der Schlange — er läuft nie', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');

      agents.submit(a, 'eins');
      const second = agents.submit(a, 'zwei')!;
      await flush();

      agents.cancel(second);
      await flush();
      expect(agents.count).toBe(1);

      await slow.release(0);
      expect(slow.prompts).toEqual(['eins']);
      expect(agents.count).toBe(0);
    });

    it('beendet einen laufenden Agenten und lässt die App unverändert', async () => {
      const cancelAgent = vi.fn(async () => true);
      const slow = makeSlowHost({ cancelAgent });
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');
      const store = useAppWindow(a);
      const before = store.currentHtml;

      const job = agents.submit(a, 'eins')!;
      await flush();
      expect(store.busy).toBe(true);

      agents.cancel(job);
      expect(cancelAgent).toHaveBeenCalledWith(store.runId);

      // Der Kindprozess endet — das Ergebnis darf nicht mehr ankommen.
      await slow.release(0, { ok: false, error: 'Abgebrochen' });

      expect(store.currentHtml).toBe(before);
      expect(store.error).toBeNull();
      expect(store.busy).toBe(false);
      expect(store.chat).toEqual([]);
      expect(agents.count).toBe(0);
      expect(slow.host.saveApp).not.toHaveBeenCalled();
    });

    it('startet einen Auftrag nicht mehr, der während seines Anlaufs abgebrochen wird', async () => {
      // Fenster zu: Der Auftrag holt erst den Stand von der Platte — genau dann
      // trifft der Abbruch ein.
      const slow = makeSlowHost({
        loadApp: vi.fn(async () => {
          agents.cancel(agents.jobs[0].jobId);
          return null;
        }),
      });
      setHost(slow.host);
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const a = openWindow('a-1', 'A');
      useWorkspaceStore().maxAgents = 1;

      desktop.closeWindow(a);
      useAppWindow(a).$dispose();
      agents.submit(a, 'eins');
      await flush();

      expect(slow.started()).toBe(0);
      expect(agents.count).toBe(0);
    });

    it('gibt nach einem Abbruch den Platz für den nächsten Wunsch frei', async () => {
      const slow = makeSlowHost({ cancelAgent: vi.fn(async () => true) });
      setHost(slow.host);
      useWorkspaceStore().maxAgents = 1;
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');
      const b = openWindow('b-2', 'B');

      const job = agents.submit(a, 'eins')!;
      agents.submit(b, 'zwei');
      await flush();
      expect(slow.started()).toBe(1);

      agents.cancel(job);
      await slow.release(0, { ok: false, error: 'Abgebrochen' });

      expect(slow.prompts).toEqual(['eins', 'zwei']);
    });
  });

  describe('Läufe überleben ihr Fenster', () => {
    it('läuft weiter, wenn das Fenster geschlossen wird, und speichert das Ergebnis', async () => {
      const saved: AppData[] = [];
      const slow = makeSlowHost({
        saveApp: vi.fn(async (_f, data: AppData) => { saved.push(data); return { ok: true }; }),
      });
      setHost(slow.host);
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const a = openWindow('a-1', 'A');
      const store = useAppWindow(a);

      agents.submit(a, 'eins');
      await flush();

      // Fenster zu — wie WindowFrame es beim Aushängen tut.
      desktop.closeWindow(a);
      store.$dispose();

      await slow.release(0, { ok: true, files: FILES(DOC('A', '🧮', 'neu')), html: DOC('A', '🧮', 'neu') });

      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('a-1');
      expect(saved[0].html).toContain('neu');
      expect(agents.count).toBe(0);
    });

    it('macht aus einem Entwurf, dessen Fenster zugeht, eine echte App auf der Platte', async () => {
      const saved: AppData[] = [];
      const slow = makeSlowHost({
        saveApp: vi.fn(async (_f, data: AppData) => { saved.push(data); return { ok: true }; }),
      });
      setHost(slow.host);
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const draft = openWindow(null);
      const store = useAppWindow(draft);

      agents.submit(draft, 'Ein Rechner');
      await flush();

      desktop.closeWindow(draft);
      store.$dispose();

      await slow.release(0, { ok: true, files: FILES(DOC('Taschenrechner', '🧮')), html: DOC('Taschenrechner', '🧮') });

      expect(saved).toHaveLength(1);
      expect(saved[0].id).toMatch(/^taschenrechner-/);
      expect(saved[0].name).toBe('Taschenrechner');
      expect(saved[0].icon).toBe('🧮');
    });

    it('holt für einen wartenden Wunsch den Stand von der Platte, wenn sein Fenster zu ist', async () => {
      const disk: AppData = {
        id: 'a-1',
        name: 'A',
        icon: '🧩',
        createdAt: 1,
        updatedAt: 2,
        files: FILES(DOC('A', '🧩', 'von-platte')),
        html: DOC('A', '🧩', 'von-platte'),
        chat: [],
      };
      const slow = makeSlowHost({ loadApp: vi.fn(async () => disk) });
      setHost(slow.host);
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const a = openWindow('a-1', 'A');
      const b = openWindow('b-2', 'B');
      useWorkspaceStore().maxAgents = 1;

      agents.submit(b, 'zuerst');
      agents.submit(a, 'danach');
      await flush();

      desktop.closeWindow(a);
      useAppWindow(a).$dispose();
      await slow.release(0);

      expect(slow.prompts).toEqual(['zuerst', 'danach']);
      const secondCall = (slow.host.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[1];
      expect((secondCall[1] as SourceFile[])[0].content).toContain('von-platte');
    });

    it('lädt ein inzwischen woanders geöffnetes Fenster derselben App nach', async () => {
      const disk: AppData = {
        id: 'a-1',
        name: 'A',
        icon: '🧩',
        createdAt: 1,
        updatedAt: 2,
        files: FILES(DOC('A', '🧩', 'gespeichert')),
        html: DOC('A', '🧩', 'gespeichert'),
        chat: [],
      };
      const slow = makeSlowHost({ loadApp: vi.fn(async () => disk) });
      setHost(slow.host);
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const first = openWindow('a-1', 'A');

      agents.submit(first, 'eins');
      await flush();

      desktop.closeWindow(first);
      useAppWindow(first).$dispose();
      const again = desktop.openApp('a-1', { title: 'A', icon: '🧩' });

      await slow.release(0);

      expect(useAppWindow(again).currentHtml).toContain('gespeichert');
    });
  });

  describe('Eingabe aus dem Chat eines Fensters', () => {
    it('führt den Wunsch dem Fenster zu, aus dem er kommt', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const a = openWindow('a-1', 'A');
      openWindow('b-2', 'B'); // b liegt vorn — der Wunsch kommt trotzdem aus a

      agents.submit(a, 'mach was');
      await flush();

      expect(desktop.windows).toHaveLength(2);
      expect(agents.jobs[0].instanceId).toBe(a);
    });

    it('macht aus dem Entwurfsfenster eine benannte App', async () => {
      setHost(makeHost());
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const draft = openWindow(null);

      agents.submit(draft, 'Ein Rechner');
      await flush();

      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0].appId).not.toBeNull();
      expect(desktop.windows[0].title).toBe('Rechner');
    });

    it('nimmt keinen leeren Wunsch an', async () => {
      const host = makeHost();
      setHost(host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');

      expect(agents.submit(a, '   ')).toBeNull();
      await flush();
      expect(agents.count).toBe(0);
      expect(host.generate).not.toHaveBeenCalled();
    });

    it('braucht ein Arbeitsverzeichnis', async () => {
      setHost(makeHost());
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');
      useWorkspaceStore().folder = null;

      agents.submit(a, 'Ein Rechner');
      await flush();

      expect(agents.count).toBe(0);
    });
  });

  describe('Nachbereitung eines Laufs', () => {
    it('übernimmt Name und Icon des fertigen Entwurfs ins Fenster und frischt die Kacheln auf', async () => {
      const host = makeHost();
      setHost(host);
      const agents = useAgentsStore();
      const desktop = useDesktopStore();
      const draft = openWindow(null);

      agents.submit(draft, 'Ein Rechner');
      await flush();

      const win = desktop.find(draft)!;
      expect(win.appId).toMatch(/^rechner-/);
      expect(win.title).toBe('Rechner');
      expect(win.icon).toBe('🧮');
      expect(host.listApps).toHaveBeenCalled();
    });

    it('reiht einen zweiten Wunsch an denselben Entwurf hinter den ersten', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const draft = openWindow(null);

      agents.submit(draft, 'eins');
      agents.submit(draft, 'zwei');
      await flush();
      expect(slow.started()).toBe(1);

      await slow.release(0);
      expect(slow.prompts).toEqual(['eins', 'zwei']);
      // Der Entwurf ist jetzt eine echte App — der wartende Wunsch zählt zu ihr.
      expect(agents.jobs[0].appKey).toMatch(/^rechner-/);
    });

    it('meldet einen fertigen Lauf in den Meldungsstapel', async () => {
      setHost(makeHost());
      const agents = useAgentsStore();
      const notes = useNotificationsStore();
      const a = openWindow('a-1', 'Rechner');

      agents.submit(a, 'eins');
      await flush();

      expect(notes.toasts).toHaveLength(1);
      expect(notes.toasts[0].kind).toBe('success');
      expect(notes.toasts[0].text).toContain('Rechner');
    });

    it('meldet einen Fehlschlag, auch wenn sein Fenster längst zu ist', async () => {
      const slow = makeSlowHost();
      setHost(slow.host);
      const agents = useAgentsStore();
      const notes = useNotificationsStore();
      const desktop = useDesktopStore();
      const a = openWindow('a-1', 'Rechner');

      agents.submit(a, 'eins');
      await flush();
      desktop.closeWindow(a);

      await slow.release(0, { ok: false, error: 'CLI nicht gefunden' });

      expect(notes.toasts).toHaveLength(1);
      expect(notes.toasts[0].kind).toBe('error');
      expect(notes.toasts[0].text).toContain('CLI nicht gefunden');
    });

    it('meldet einen abgebrochenen Lauf nicht', async () => {
      const slow = makeSlowHost({ cancelAgent: vi.fn(async () => true) });
      setHost(slow.host);
      const agents = useAgentsStore();
      const notes = useNotificationsStore();
      const a = openWindow('a-1', 'Rechner');

      const job = agents.submit(a, 'eins')!;
      await flush();
      agents.cancel(job);
      await slow.release(0, { ok: false, error: 'Abgebrochen' });

      expect(notes.toasts).toEqual([]);
    });

    it('merkt einen fertigen Lauf als zuletzt gelaufen (für die Telemetrie)', async () => {
      setHost(makeHost());
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'Rechner');

      agents.submit(a, 'eins');
      await flush();

      expect(agents.count).toBe(0);
      expect(agents.recent).toHaveLength(1);
      expect(agents.recent[0]).toMatchObject({ label: 'Rechner', prompt: 'eins', ok: true });
      expect(agents.recent[0].time).toBeGreaterThan(0);
    });

    it('merkt einen Fehlschlag samt Meldung', async () => {
      setHost(makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: false, error: 'CLI nicht gefunden' })),
      }));
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'Rechner');

      agents.submit(a, 'eins');
      await flush();

      expect(agents.recent[0]).toMatchObject({ ok: false, error: 'CLI nicht gefunden' });
    });

    it('merkt einen abgebrochenen Lauf nicht', async () => {
      const slow = makeSlowHost({ cancelAgent: vi.fn(async () => true) });
      setHost(slow.host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'Rechner');

      const job = agents.submit(a, 'eins')!;
      await flush();
      agents.cancel(job);
      await slow.release(0, { ok: false, error: 'Abgebrochen' });

      expect(agents.recent).toEqual([]);
    });

    it('behält nur die jüngsten Läufe, neuester zuerst', async () => {
      setHost(makeHost());
      const agents = useAgentsStore();
      for (let i = 0; i < MAX_RECENT_RUNS + 3; i += 1) {
        agents.submit(openWindow(`a-${i}`, `App ${i}`), `wunsch ${i}`);
        await flush();
      }

      expect(agents.recent).toHaveLength(MAX_RECENT_RUNS);
      expect(agents.recent[0].prompt).toBe(`wunsch ${MAX_RECENT_RUNS + 2}`);
      expect(agents.recent[MAX_RECENT_RUNS - 1].prompt).toBe('wunsch 3');
    });

    it('verwirft nach einem Fehlschlag den Auftrag und lässt den Fehler im Fenster stehen', async () => {
      const host = makeHost({
        generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: false, error: 'CLI nicht gefunden' })),
      });
      setHost(host);
      const agents = useAgentsStore();
      const a = openWindow('a-1', 'A');

      agents.submit(a, 'eins');
      await flush();

      expect(agents.count).toBe(0);
      expect(useAppWindow(a).error).toBe('CLI nicht gefunden');
    });
  });
});
