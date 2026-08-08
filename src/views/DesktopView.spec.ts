import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import DesktopView from './DesktopView.vue';
import WindowFrame from '@/components/WindowFrame.vue';
import IconDialog from '@/components/IconDialog.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import { useAgentsStore } from '@/stores/agents';
import { useAppWindow } from '@/stores/app';
import { setHost } from '@/services/host';
import type { AppData, AppSummary, MorphosHost } from '@/types';

const apps: AppSummary[] = [
  { id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5, versions: 3 },
  { id: 'editor-2', name: 'Editor', icon: '📝', createdAt: 2, updatedAt: 9, versions: 1 },
];

/** Ein (winziges) Bild-Icon, wie es der Icon-Dialog ablegt. */
const IMAGE_ICON = `data:image/png;base64,${Buffer.alloc(60, 3).toString('base64')}`;

const HTML = '<!DOCTYPE html><html><head><title>Rechner</title></head><body>calc</body></html>';
const rechnerData: AppData = {
  id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5,
  files: [{ path: 'src/index.html', content: HTML }], html: HTML, chat: [],
};

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

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/desktop', name: 'desktop', component: DesktopView },
      { path: '/app/new', name: 'app-new', component: { template: '<div>new</div>' } },
      { path: '/app/:id', name: 'app', component: { template: '<div>app</div>' } },
    ],
  });
}

describe('DesktopView', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  async function mountView() {
    const router = makeRouter();
    router.push('/desktop');
    await router.isReady();
    const wrapper = mount(DesktopView, { global: { plugins: [pinia, router] } });
    await flushPromises();
    return { wrapper, router };
  }

  it('zeigt eine Kachel je App plus „Neue App“', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Rechner');
    expect(wrapper.text()).toContain('Editor');
    expect(wrapper.text()).toContain('Neue App');
    // 2 Apps + 1 Neu-Kachel
    expect(wrapper.findAll('.tile')).toHaveLength(3);
  });

  it('öffnet eine App als Fenster per Klick auf ihre Kachel', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    const tile = wrapper.findAll('.tile').find((t) => t.text().includes('Rechner'))!;
    await tile.trigger('click');
    await flushPromises();
    expect(desktop.windows).toHaveLength(1);
    expect(desktop.windows[0].appId).toBe('rechner-1');
    expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(1);
  });

  it('öffnet ein Entwurfsfenster über „Neue App“', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    await wrapper.get('.tile.new').trigger('click');
    await flushPromises();
    expect(desktop.windows).toHaveLength(1);
    expect(desktop.windows[0].appId).toBeNull();
  });

  it('minimiert ein Fenster in den Dock und stellt es wieder her', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    const tile = wrapper.findAll('.tile').find((t) => t.text().includes('Rechner'))!;
    await tile.trigger('click');
    await flushPromises();

    await wrapper.get('.w-min').trigger('click');
    await flushPromises();
    expect(wrapper.find('.dock').exists()).toBe(true);

    await wrapper.get('.dock-item').trigger('click');
    expect(desktop.windows[0].minimized).toBe(false);
  });

  it('enthält keine Einstellungs-Panels mehr (sie liegen im Einstellungs-Dialog)', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('.perms').exists()).toBe(false);
    expect(wrapper.find('.lib-add').exists()).toBe(false);
    expect(wrapper.find('.access-bar').exists()).toBe(false);
  });

  describe('Arbeitsanzeige beschäftigter Apps', () => {
    /** Ein laufender Auftrag, wie ihn die Warteschlange führt. */
    function busyJob(appId: string, instanceId: string) {
      useAgentsStore().jobs = [{
        jobId: 'job-1',
        appKey: appId,
        state: 'running' as const,
        instanceId,
        appId,
        label: 'Rechner',
        prompt: 'Mach was',
        attachments: [],
        cancelled: false,
      }];
    }

    it('markiert die Kachel einer App, für die ein Agent arbeitet', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.find('.tile-busy').exists()).toBe(false);

      busyJob('rechner-1', 'win-1');
      await flushPromises();

      const tiles = wrapper.findAll('.tile-wrap');
      const rechner = tiles.find((t) => t.text().includes('Rechner'))!;
      const editor = tiles.find((t) => t.text().includes('Editor'))!;
      expect(rechner.find('.busy-dot').exists()).toBe(true);
      expect(editor.find('.busy-dot').exists()).toBe(false);
    });

    it('markiert das Fenster einer beschäftigten App im Titel und im Dock', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const tile = wrapper.findAll('.tile').find((t) => t.text().includes('Rechner'))!;
      await tile.trigger('click');
      await flushPromises();
      const instanceId = desktop.windows[0].instanceId;

      busyJob('rechner-1', instanceId);
      await flushPromises();
      expect(wrapper.find('.w-busy').exists()).toBe(true);

      await wrapper.get('.w-min').trigger('click');
      await flushPromises();
      expect(wrapper.get('.dock-item').find('.busy-dot').exists()).toBe(true);
    });
  });

  it('richtet die globale Promptleiste an das aktive Fenster (Entwurf, wenn keins offen)', async () => {
    const { wrapper } = await mountView();
    const spy = vi.spyOn(useAgentsStore(), 'submitToActive').mockReturnValue('job-1');

    // ChatDock unten absenden.
    await wrapper.get('textarea').setValue('Ein Spiel');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });

    expect(spy).toHaveBeenCalledWith('Ein Spiel', []);
  });

  it('zeigt im Fenster-Modus den Namen der aktiven App an der Promptleiste', async () => {
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    await flushPromises();
    expect(wrapper.get('.chat-context').text()).toContain('Rechner');
    expect(wrapper.get('.chat-context').text()).toContain('🧮');
  });

  describe('Icon einer App', () => {
    /** Öffnet den Icon-Dialog über die Kachel der genannten App. */
    async function openIconDialog(wrapper: VueWrapper) {
      const tile = wrapper.findAll('.tile-wrap').find((t) => t.text().includes('Rechner'))!;
      await tile.get('[title="Icon ändern"]').trigger('click');
      await flushPromises();
      return wrapper.getComponent(IconDialog);
    }

    it('zeigt ein Bild-Icon als Bild — auf der Kachel und an der Promptleiste', async () => {
      setHost(makeHost({
        listApps: vi.fn(async () => [{ ...apps[0], icon: IMAGE_ICON, iconCustom: true }, apps[1]]),
      }));
      const { wrapper } = await mountView();
      useDesktopStore().openApp('rechner-1', { title: 'Rechner', icon: IMAGE_ICON });
      await flushPromises();

      const tile = wrapper.findAll('.tile-wrap').find((t) => t.text().includes('Rechner'))!;
      expect(tile.get('.tile img').attributes('src')).toBe(IMAGE_ICON);
      expect(wrapper.get('.chat-context img').attributes('src')).toBe(IMAGE_ICON);
    });

    it('setzt das Icon einer geschlossenen App und zieht die Kachel nach', async () => {
      const host = makeHost();
      setHost(host);
      const { wrapper } = await mountView();

      const dialog = await openIconDialog(wrapper);
      dialog.vm.$emit('apply', '🎯');
      await flushPromises();

      expect(host.setAppIcon).toHaveBeenCalledWith('/apps', 'rechner-1', '🎯');
      const tile = wrapper.findAll('.tile-wrap').find((t) => t.text().includes('Rechner'))!;
      expect(tile.get('.tile').text()).toContain('🎯');
      // Der Dialog schließt sich nach getaner Arbeit.
      expect(wrapper.findComponent(IconDialog).exists()).toBe(false);
    });

    it('zieht bei offener App auch Fenster, Dock und Fensterzustand nach', async () => {
      setHost(makeHost({ loadApp: vi.fn(async () => rechnerData) }));
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      const dialog = await openIconDialog(wrapper);
      dialog.vm.$emit('apply', '🎯');
      await flushPromises();

      expect(desktop.find(instanceId)!.icon).toBe('🎯');
      expect(useAppWindow(instanceId).icon).toBe('🎯');
      expect(useAppWindow(instanceId).iconCustom).toBe(true);
      expect(wrapper.get('.w-icon').text()).toBe('🎯');
    });

    it('setzt auf die Vorgabe des Agenten zurück', async () => {
      const host = makeHost({
        listApps: vi.fn(async () => [{ ...apps[0], icon: '🎯', iconCustom: true }, apps[1]]),
        setAppIcon: vi.fn(async () => ({ ok: true, icon: '🧮' })),
      });
      setHost(host);
      const { wrapper } = await mountView();

      const dialog = await openIconDialog(wrapper);
      dialog.vm.$emit('apply', null);
      await flushPromises();

      expect(host.setAppIcon).toHaveBeenCalledWith('/apps', 'rechner-1', null);
      const tile = wrapper.findAll('.tile-wrap').find((t) => t.text().includes('Rechner'))!;
      expect(tile.get('.tile').text()).toContain('🧮');
    });

    it('lässt den Dialog bei einem Fehler offen und meldet ihn', async () => {
      setHost(makeHost({ setAppIcon: vi.fn(async () => ({ ok: false, error: 'Das Bild ist zu groß.' })) }));
      const { wrapper } = await mountView();

      const dialog = await openIconDialog(wrapper);
      dialog.vm.$emit('apply', '🎯');
      await flushPromises();

      expect(wrapper.findComponent(IconDialog).exists()).toBe(true);
      expect(useWorkspaceStore().error).toBe('Das Bild ist zu groß.');
    });
  });

  it('zeigt im Einzel-Modus nur das aktive Fenster (Vollbild)', async () => {
    const ws = useWorkspaceStore();
    ws.uiMode = 'single';
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();

    desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
    await flushPromises();

    const frames = wrapper.findAllComponents(WindowFrame);
    expect(frames).toHaveLength(1);
    expect(frames[0].props('single')).toBe(true);
    expect(frames[0].props('win').appId).toBe('editor-2'); // das zuletzt fokussierte
  });

  it('kehrt im Einzel-Modus über den Desktop-Knopf zum Launcher zurück', async () => {
    useWorkspaceStore().uiMode = 'single';
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    await flushPromises();
    expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(1);

    await wrapper.get('.w-desktop').trigger('click');
    await flushPromises();

    // Keine App mehr im Vordergrund, der Launcher ist wieder frei.
    expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(0);
    expect(wrapper.findAll('.tile')).toHaveLength(3);
  });

  it('listet im Einzel-Modus die offenen Apps auf dem Desktop im Dock', async () => {
    useWorkspaceStore().uiMode = 'single';
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    await flushPromises();
    // Solange die App läuft, verdeckt kein Dock die Fläche.
    expect(wrapper.find('.dock').exists()).toBe(false);

    await wrapper.get('.w-desktop').trigger('click');
    await flushPromises();
    expect(wrapper.get('.dock').text()).toContain('Rechner');

    await wrapper.get('.dock-item').trigger('click');
    await flushPromises();
    expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(1);
  });

  describe('Ein laufender Agent überlebt den Abstecher zum Desktop', () => {
    /** Ein Fenster im Einzel-Modus, für das gerade ein Agent arbeitet. */
    async function runningSingleApp() {
      useWorkspaceStore().uiMode = 'single';
      const loadApp = vi.fn(async () => rechnerData);
      setHost(makeHost({ loadApp }));
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      const store = useAppWindow(instanceId);
      store.chat = [{ role: 'user', text: 'Mach die Tasten blau', time: 1 }];
      store.busy = true;
      store.runStartedAt = Date.now() - 65_000;
      store.activity = [{ kind: 'tool', name: 'Read', detail: 'src/index.html' }];
      await flushPromises();
      return { wrapper, desktop, instanceId, loadApp };
    }

    /** ← Desktop und über das Dock wieder zurück in die App. */
    async function toDesktopAndBack(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
      await wrapper.get('.w-desktop').trigger('click');
      await flushPromises();
      await wrapper.get('.dock-item').trigger('click');
      await flushPromises();
    }

    it('behält Verlauf und Fortschritt des laufenden Laufs', async () => {
      const { wrapper, instanceId } = await runningSingleApp();
      await toDesktopAndBack(wrapper);

      const store = useAppWindow(instanceId);
      expect(store.busy).toBe(true);
      expect(store.chat.map((m) => m.text)).toContain('Mach die Tasten blau');
      expect(store.activity).toHaveLength(1);
      expect(store.runStartedAt).not.toBeNull();
    });

    it('führt den laufenden Schritt in der Warteanzeige weiter vor', async () => {
      const { wrapper } = await runningSingleApp();
      await toDesktopAndBack(wrapper);

      const loading = wrapper.get('.w-loading');
      expect(loading.get('.w-step').text()).toContain('Read: src/index.html');
      expect(loading.get('.w-elapsed').text()).toBe('1:05');
    });

    it('lädt die App dabei nicht von der Platte neu (das überschriebe den Lauf)', async () => {
      const { wrapper, loadApp } = await runningSingleApp();
      const before = loadApp.mock.calls.length;
      await toDesktopAndBack(wrapper);
      expect(loadApp.mock.calls.length).toBe(before);
    });
  });

  it('meldet an der Promptleiste, dass auf dem Desktop eine neue App entsteht', async () => {
    useWorkspaceStore().uiMode = 'single';
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    await flushPromises();
    expect(wrapper.find('.chat-context').exists()).toBe(false);

    await wrapper.get('.w-desktop').trigger('click');
    await flushPromises();
    expect(wrapper.get('.chat-context').text()).toContain('Neue App');
  });
});
