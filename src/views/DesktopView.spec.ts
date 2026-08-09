import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import DesktopView from './DesktopView.vue';
import WindowFrame from '@/components/WindowFrame.vue';
import AppWindow from '@/components/AppWindow.vue';
import SystemWindow from '@/components/SystemWindow.vue';
import ExplorerPanel from '@/components/ExplorerPanel.vue';
import IconDialog from '@/components/IconDialog.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import LauncherOverlay from '@/components/LauncherOverlay.vue';
import SwitcherOverlay from '@/components/SwitcherOverlay.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import { useShellStore } from '@/stores/shell';
import { useAgentsStore } from '@/stores/agents';
import { useAppWindow } from '@/stores/app';
import { setHost } from '@/services/host';
import { columns, slotPos } from '@/core/arrange';
import { EXPLORER_ID } from '@/core/system';
import { DEFAULT_WALLPAPER, wallpaperCss } from '@/core/wallpaper';
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

  /**
   * `attach` hängt die Ansicht ins Dokument — nötig, wo eine Taste von einem
   * Element aus bis zum Fenster steigen soll (Tastenkürzel).
   */
  async function mountView({ attach = false } = {}) {
    const router = makeRouter();
    router.push('/desktop');
    await router.isReady();
    const wrapper = mount(DesktopView, {
      global: { plugins: [pinia, router] },
      ...(attach ? { attachTo: document.body } : {}),
    });
    await flushPromises();
    return { wrapper, router };
  }

  /** Die Kachel-Hülle einer App auf dem Desktop. */
  function tileWrap(wrapper: VueWrapper, name: string) {
    return wrapper.findAll('.tile-wrap').find((t) => t.text().includes(name))!;
  }

  /** Rechtsklick auf die Kachel einer App — ihr Kontextmenü klappt auf. */
  async function openIconMenu(wrapper: VueWrapper, name: string) {
    await tileWrap(wrapper, name).get('.tile').trigger('contextmenu', { clientX: 200, clientY: 150 });
    await flushPromises();
    return wrapper.getComponent(ContextMenu);
  }

  /** Einen Eintrag des offenen Kontextmenüs wählen. */
  async function pickMenu(wrapper: VueWrapper, label: string) {
    const item = wrapper.findAll('.ctx-item').find((i) => i.text().includes(label))!;
    await item.trigger('click');
    await flushPromises();
  }

  it('zeigt eine Kachel je App plus „Neue App“', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Rechner');
    expect(wrapper.text()).toContain('Editor');
    expect(wrapper.text()).toContain('Neue App');
    // 2 Apps + 1 Neu-Kachel
    expect(wrapper.findAll('.tile')).toHaveLength(3);
  });

  it('malt den Hintergrund des Verzeichnisses hinter Kacheln und Fenstern', async () => {
    const { wrapper } = await mountView();
    const ws = useWorkspaceStore();
    const layer = () => wrapper.get('.wallpaper');
    // Ohne eigenen Hintergrund die Vorgabe …
    expect(layer().attributes('style')).toContain(wallpaperCss(DEFAULT_WALLPAPER));

    ws.setWallpaper({ kind: 'color', color: '#123456' });
    await flushPromises();

    // … danach der gewählte (jsdom schreibt Farben als rgb) …
    expect(layer().attributes('style')).toContain('rgb(18, 52, 86)');
    // … und er liegt stets vor dem Launcher im Stapel, also dahinter.
    const stage = wrapper.get('.stage').element;
    expect(stage.firstElementChild).toBe(layer().element);
    // Die Kacheln bleiben klickbar — der Hintergrund liegt nur darunter.
    const tile = wrapper.findAll('.tile').find((t) => t.text().includes('Rechner'))!;
    await tile.trigger('click');
    await flushPromises();
    expect(useDesktopStore().windows).toHaveLength(1);
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
    /** Öffnet den Icon-Dialog über das Kontextmenü der genannten App. */
    async function openIconDialog(wrapper: VueWrapper) {
      await openIconMenu(wrapper, 'Rechner');
      await pickMenu(wrapper, 'Icon ändern');
      return wrapper.getComponent(IconDialog);
    }

    it('trägt im Kontextmenü ein Zahnrad (Einstellungen), keine Palette', async () => {
      const { wrapper } = await mountView();
      await openIconMenu(wrapper, 'Rechner');
      const entry = wrapper.findAll('.ctx-item').find((i) => i.text().includes('Icon ändern'))!;
      expect(entry.get('.ctx-icon').text()).toBe('⚙');
      expect(entry.text()).not.toContain('🎨');
    });

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

  describe('Desktop-Icons wie am Schreibtisch', () => {
    it('zeigt die Kachel rahmenlos — nur Glyphe und Name', async () => {
      const { wrapper } = await mountView();
      const wrap = tileWrap(wrapper, 'Rechner');
      const tile = wrap.get('.tile');

      expect(tile.text()).toContain('🧮');
      expect(tile.get('.name').text()).toBe('Rechner');
      // Keine Knöpfe mehr auf der Kachel — die Aktionen stehen im Kontextmenü.
      expect(wrap.find('.tile-actions').exists()).toBe(false);
      expect(wrap.find('[title="Löschen"]').exists()).toBe(false);
      expect(wrap.find('[title="Icon ändern"]').exists()).toBe(false);
    });

    it('zeigt die Version(en) erst beim Überfahren', async () => {
      const { wrapper } = await mountView();
      const wrap = tileWrap(wrapper, 'Rechner');
      expect(wrap.find('.meta').exists()).toBe(false);

      await wrap.trigger('mouseenter');
      expect(wrap.get('.meta').text()).toBe('3 Version(en)');
      // Und nur bei dieser Kachel.
      expect(tileWrap(wrapper, 'Editor').find('.meta').exists()).toBe(false);

      await wrap.trigger('mouseleave');
      expect(wrap.find('.meta').exists()).toBe(false);
    });

    it('öffnet auf Rechtsklick ein Kontextmenü mit allen Aktionen', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.findComponent(ContextMenu).exists()).toBe(false);

      const menu = await openIconMenu(wrapper, 'Rechner');

      expect(menu.props('x')).toBe(200);
      expect(menu.props('y')).toBe(150);
      expect(wrapper.findAll('.ctx-item').map((i) => i.get('.ctx-label').text())).toEqual([
        'Öffnen',
        'Icon ändern',
        'Im Dock behalten',
        'Löschen',
      ]);
    });

    it('öffnet die App über „Öffnen“ und schließt dabei das Menü', async () => {
      const { wrapper } = await mountView();
      await openIconMenu(wrapper, 'Rechner');

      await pickMenu(wrapper, 'Öffnen');

      expect(useDesktopStore().windows.map((w) => w.appId)).toEqual(['rechner-1']);
      expect(wrapper.findComponent(ContextMenu).exists()).toBe(false);
    });

    it('löscht eine App über das Menü — erst nach Rückfrage', async () => {
      const host = makeHost();
      setHost(host);
      const { wrapper } = await mountView();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      await openIconMenu(wrapper, 'Rechner');
      await pickMenu(wrapper, 'Löschen');
      expect(confirmSpy).toHaveBeenCalled();
      expect(host.deleteApp).not.toHaveBeenCalled();

      confirmSpy.mockReturnValue(true);
      await openIconMenu(wrapper, 'Rechner');
      await pickMenu(wrapper, 'Löschen');
      expect(host.deleteApp).toHaveBeenCalledWith('/apps', 'rechner-1');
      confirmSpy.mockRestore();
    });

    it('behält eine App im Dock und nimmt sie wieder heraus', async () => {
      const { wrapper } = await mountView();
      const ws = useWorkspaceStore();

      await openIconMenu(wrapper, 'Rechner');
      await pickMenu(wrapper, 'Im Dock behalten');
      expect(ws.favoriteIds).toEqual(['rechner-1']);

      // Beim nächsten Mal steht dort der umgekehrte Weg.
      await openIconMenu(wrapper, 'Rechner');
      await pickMenu(wrapper, 'Aus dem Dock entfernen');
      expect(ws.favoriteIds).toEqual([]);
    });

    it('bietet dieselbe Dock-Aktion auch am Dock-Eintrag an', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.minimizeWindow(instanceId);
      await flushPromises();

      await wrapper.get('.dock-item').trigger('contextmenu', { clientX: 40, clientY: 700 });
      await flushPromises();

      expect(wrapper.findAll('.ctx-item').map((i) => i.get('.ctx-label').text())).toEqual([
        'Im Dock behalten',
      ]);
      await pickMenu(wrapper, 'Im Dock behalten');
      expect(useWorkspaceStore().favoriteIds).toEqual(['rechner-1']);
    });

    it('schließt das Menü mit Escape, ohne etwas zu tun', async () => {
      const { wrapper } = await mountView();
      await openIconMenu(wrapper, 'Rechner');

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();

      expect(wrapper.findComponent(ContextMenu).exists()).toBe(false);
      expect(useDesktopStore().windows).toHaveLength(0);
    });
  });

  describe('Kacheln anordnen', () => {
    // Ohne gemessene Fläche (jsdom) rechnet die Anordnung mit der Vorgabe.
    const cols = columns({ w: 0, h: 0 });

    /** Die Kachel einer App samt ihrer gesetzten Position. */
    function tileOf(wrapper: VueWrapper, name: string) {
      const wrap = wrapper.findAll('.tile-wrap').find((t) => t.text().includes(name))!;
      const style = (wrap.element as HTMLElement).style;
      return { wrap, x: parseFloat(style.left), y: parseFloat(style.top) };
    }

    /** Zieht eine Kachel um (dx, dy) — mit Maustaste halten, bewegen, loslassen. */
    async function drag(wrapper: VueWrapper, name: string, dx: number, dy: number) {
      const { wrap } = tileOf(wrapper, name);
      await wrap.get('.tile').trigger('mousedown', { button: 0, clientX: 500, clientY: 400 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 + dx, clientY: 400 + dy }));
      window.dispatchEvent(new MouseEvent('mouseup'));
      await flushPromises();
      // Der Browser schickt nach dem Loslassen noch den Klick hinterher.
      await wrap.get('.tile').trigger('click');
      await flushPromises();
    }

    it('legt Apps ohne gemerkte Position ins Raster, hinter die Neu-Kachel', async () => {
      const { wrapper } = await mountView();
      const rechner = tileOf(wrapper, 'Rechner');
      const editor = tileOf(wrapper, 'Editor');
      expect({ x: rechner.x, y: rechner.y }).toEqual(slotPos(1, cols));
      expect({ x: editor.x, y: editor.y }).toEqual(slotPos(2, cols));
    });

    it('stellt eine gemerkte Position wieder her', async () => {
      const ws = useWorkspaceStore();
      ws.iconPositions = { '/apps': { 'rechner-1': { x: 300, y: 220 } } };
      const { wrapper } = await mountView();

      expect(tileOf(wrapper, 'Rechner')).toMatchObject({ x: 300, y: 220 });
      // Der freie Platz im Raster bleibt für die übrigen Kacheln.
      expect(tileOf(wrapper, 'Editor')).toMatchObject(slotPos(1, cols));
    });

    it('zieht eine Kachel an eine neue Stelle und merkt sie', async () => {
      const { wrapper } = await mountView();
      const before = tileOf(wrapper, 'Rechner');

      await drag(wrapper, 'Rechner', 90, 60);

      const ws = useWorkspaceStore();
      expect(ws.iconLayout['rechner-1']).toEqual({ x: before.x + 90, y: before.y + 60 });
      expect(tileOf(wrapper, 'Rechner')).toMatchObject({ x: before.x + 90, y: before.y + 60 });
    });

    it('öffnet die App beim Ziehen nicht', async () => {
      const { wrapper } = await mountView();
      await drag(wrapper, 'Rechner', 90, 60);
      expect(useDesktopStore().windows).toHaveLength(0);
    });

    it('öffnet die App weiterhin per Klick (ohne Ziehen)', async () => {
      const { wrapper } = await mountView();
      const { wrap } = tileOf(wrapper, 'Rechner');

      await wrap.get('.tile').trigger('mousedown', { button: 0, clientX: 500, clientY: 400 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 501, clientY: 400 })); // Wackler
      window.dispatchEvent(new MouseEvent('mouseup'));
      await wrap.get('.tile').trigger('click');
      await flushPromises();

      expect(useDesktopStore().windows).toHaveLength(1);
      expect(useWorkspaceStore().iconLayout).toEqual({});
    });

    it('lässt keine Kachel über den Rand hinaus verschwinden', async () => {
      const { wrapper } = await mountView();
      await drag(wrapper, 'Rechner', -900, -900);
      expect(useWorkspaceStore().iconLayout['rechner-1']).toEqual({ x: 0, y: 0 });
    });

    it('räumt die Kacheln über den Aufräumen-Knopf zurück ins Raster', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.find('.tidy').exists()).toBe(false); // nichts zum Aufräumen

      await drag(wrapper, 'Rechner', 90, 60);
      expect(wrapper.find('.tidy').exists()).toBe(true);

      await wrapper.get('.tidy').trigger('click');
      await flushPromises();

      expect(useWorkspaceStore().iconLayout).toEqual({});
      expect(tileOf(wrapper, 'Rechner')).toMatchObject(slotPos(1, cols));
    });
  });

  describe('Sitzung beim Start', () => {
    it('holt die zuletzt offenen Fenster zurück', async () => {
      useWorkspaceStore().sessions = {
        '/apps': [
          { appId: 'editor-2', x: 30, y: 40, w: 500, h: 400, minimized: false, maximized: false },
          { appId: 'rechner-1', x: 90, y: 120, w: 600, h: 480, minimized: false, maximized: false },
        ],
      };

      const { wrapper } = await mountView();

      const frames = wrapper.findAllComponents(WindowFrame);
      expect(frames.map((f) => f.props('win').appId)).toEqual(['editor-2', 'rechner-1']);
      expect(frames[1].props('win')).toMatchObject({ x: 90, y: 120, w: 600, h: 480 });
      // Zuletzt benutzt heißt: wieder im Vordergrund.
      expect(useDesktopStore().focusedId).toBe(frames[1].props('win').instanceId);
    });

    it('öffnet beim ersten Mal nur den Launcher', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(0);
      expect(wrapper.findAll('.tile')).toHaveLength(3);
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

  describe('Suchleiste (Startmenü)', () => {
    /** Öffnet das Startmenü über seinen Knopf auf dem Desktop. */
    async function openLauncher(wrapper: VueWrapper) {
      await wrapper.get('.search-btn').trigger('click');
      await flushPromises();
      return wrapper.getComponent(LauncherOverlay);
    }

    /** Tippt in das Suchfeld und drückt eine Taste. */
    async function search(wrapper: VueWrapper, text: string, key = 'Enter') {
      await wrapper.get('.lp-input').setValue(text);
      await wrapper.get('.lp-input').trigger('keydown', { key });
      await flushPromises();
    }

    it('öffnet das Startmenü über den Knopf auf dem Desktop', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(false);

      await openLauncher(wrapper);
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(true);
      // Es kennt die Apps des Verzeichnisses.
      expect(wrapper.get('.lp-list').text()).toContain('Rechner');
    });

    it('öffnet das Startmenü auch per Tastenkürzel (Strg/⌘ + K)', async () => {
      const { wrapper } = await mountView();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      await flushPromises();
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
      await flushPromises();
      expect(wrapper.findAllComponents(LauncherOverlay)).toHaveLength(1);
    });

    it('öffnet die getippte App mit der Eingabetaste und schließt sich dabei', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      await openLauncher(wrapper);

      await search(wrapper, 'editor');

      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0].appId).toBe('editor-2');
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(false);
    });

    it('holt eine schon laufende App nur in den Vordergrund', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.minimizeWindow(instanceId);
      await flushPromises();

      await openLauncher(wrapper);
      await search(wrapper, 'rechner');

      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0].instanceId).toBe(instanceId);
      expect(desktop.windows[0].minimized).toBe(false);
    });

    it('legt über „Neue App“ einen Entwurf an', async () => {
      const { wrapper } = await mountView();
      await openLauncher(wrapper);

      await search(wrapper, 'neue app');

      const desktop = useDesktopStore();
      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0].appId).toBeNull();
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(false);
    });

    it('schließt das Startmenü mit Escape, ohne etwas zu öffnen', async () => {
      const { wrapper } = await mountView();
      await openLauncher(wrapper);

      await search(wrapper, 'rechner', 'Escape');

      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(false);
      expect(useDesktopStore().windows).toHaveLength(0);
    });
  });

  describe('Tastenkürzel', () => {
    /** Eine Tastenmeldung an das Fenster (wie vom Desktop aus getippt). */
    async function press(key: string, mods: KeyboardEventInit = {}, type = 'keydown') {
      window.dispatchEvent(new KeyboardEvent(type, { key, ...mods }));
      await flushPromises();
    }

    /** Dieselbe Taste, aber auf einem Element gedrückt (sie steigt zum Fenster auf). */
    async function pressOn(el: Element, key: string, mods: KeyboardEventInit = {}) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }));
      await flushPromises();
    }

    it('legt mit Strg/⌘ + N eine neue App an', async () => {
      const { wrapper } = await mountView();
      await press('n', { ctrlKey: true });
      const desktop = useDesktopStore();
      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0].appId).toBeNull();
      expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(1);
    });

    it('öffnet mit Strg/⌘ + , die Einstellungen', async () => {
      await mountView();
      await press(',', { metaKey: true });
      expect(useShellStore().settingsOpen).toBe(true);
    });

    it('schließt das aktive Fenster mit Strg/⌘ + ⇧ + W', async () => {
      await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      await press('W', { ctrlKey: true, shiftKey: true });
      expect(desktop.windows).toHaveLength(0);
    });

    it('minimiert und maximiert das aktive Fenster', async () => {
      await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      await press('F', { metaKey: true, shiftKey: true });
      expect(desktop.find(instanceId)!.maximized).toBe(true);
      await press('F', { metaKey: true, shiftKey: true });
      expect(desktop.find(instanceId)!.maximized).toBe(false);

      await press('M', { metaKey: true, shiftKey: true });
      expect(desktop.find(instanceId)!.minimized).toBe(true);
    });

    it('lässt ⌘/Strg + W und + M ohne Umschalttaste dem Wirtsfenster', async () => {
      await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      await press('w', { metaKey: true });
      await press('m', { metaKey: true });
      expect(desktop.windows).toHaveLength(1);
      expect(desktop.find(instanceId)!.minimized).toBe(false);
    });

    it('greift ohne offenes Fenster nicht ins Leere', async () => {
      await mountView();
      await press('W', { ctrlKey: true, shiftKey: true });
      await press('M', { ctrlKey: true, shiftKey: true });
      expect(useDesktopStore().windows).toHaveLength(0);
    });

    it('greift dieselbe Taste von der Fläche aus (Gegenprobe zum Tippen)', async () => {
      const { wrapper } = await mountView({ attach: true });
      await pressOn(wrapper.get('.tile.new').element, 'n', { ctrlKey: true });
      expect(useDesktopStore().windows).toHaveLength(1);
      wrapper.unmount();
    });

    it('rührt sich nicht, während in der Promptleiste getippt wird', async () => {
      const { wrapper } = await mountView({ attach: true });
      await pressOn(wrapper.get('textarea').element, 'n', { ctrlKey: true });
      await pressOn(wrapper.get('textarea').element, 'k', { ctrlKey: true });
      expect(useDesktopStore().windows).toHaveLength(0);
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(false);
      wrapper.unmount();
    });

    it('rührt sich auch nicht, während das Startmenü Eingaben entgegennimmt', async () => {
      const { wrapper } = await mountView({ attach: true });
      await wrapper.get('.search-btn').trigger('click');
      await flushPromises();

      await pressOn(wrapper.get('.lp-input').element, 'n', { ctrlKey: true });
      expect(useDesktopStore().windows).toHaveLength(0);
      wrapper.unmount();
    });
  });

  describe('Fensterwechsler (Strg/⌘ + Tab)', () => {
    /** Zwei bzw. drei Fenster, zuletzt benutzt zuletzt geöffnet. */
    async function withWindows(count: number) {
      const desktop = useDesktopStore();
      const ids = [desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' })];
      if (count > 1) ids.push(desktop.openApp('editor-2', { title: 'Editor', icon: '📝' }));
      if (count > 2) ids.push(desktop.openDraft());
      await flushPromises();
      return { desktop, ids };
    }

    /** Tab bei gehaltener Strg-Taste. */
    async function tab(shiftKey = false) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, shiftKey }));
      await flushPromises();
    }

    /** Die Haltetaste loslassen — das gewählte Fenster wird aktiv. */
    async function release(key = 'Control') {
      window.dispatchEvent(new KeyboardEvent('keyup', { key }));
      await flushPromises();
    }

    /** Der hervorgehobene Eintrag der Auswahl. */
    function selected(wrapper: VueWrapper): string {
      return wrapper.get('.sw-item.active .sw-name').text();
    }

    it('zeigt die offenen Fenster, zuletzt benutzt zuerst', async () => {
      const { wrapper } = await mountView();
      await withWindows(3);

      await tab();

      const overlay = wrapper.getComponent(SwitcherOverlay);
      expect(overlay.props('windows').map((w: { title: string }) => w.title)).toEqual([
        'Neue App',
        'Editor',
        'Rechner',
      ]);
      // Gewählt ist zunächst das Fenster hinter dem aktuellen.
      expect(selected(wrapper)).toBe('Editor');
    });

    it('wechselt beim Loslassen zum gewählten Fenster', async () => {
      const { wrapper } = await mountView();
      const { desktop, ids } = await withWindows(2);

      await tab();
      await release();

      expect(wrapper.findComponent(SwitcherOverlay).exists()).toBe(false);
      expect(desktop.focusedId).toBe(ids[0]); // der Rechner war der vorletzte
    });

    it('wandert mit jedem weiteren Tab eine Stelle weiter', async () => {
      const { wrapper } = await mountView();
      const { desktop, ids } = await withWindows(3);

      await tab();
      expect(selected(wrapper)).toBe('Editor');
      await tab();
      expect(selected(wrapper)).toBe('Rechner');
      // Am Ende geht es vorn weiter.
      await tab();
      expect(selected(wrapper)).toBe('Neue App');

      await tab();
      await release();
      expect(desktop.focusedId).toBe(ids[1]); // Editor
    });

    it('wandert mit gehaltener Umschalttaste rückwärts', async () => {
      const { wrapper } = await mountView();
      await withWindows(3);

      await tab(true);
      expect(selected(wrapper)).toBe('Rechner');
    });

    it('holt ein minimiertes Fenster zurück', async () => {
      await mountView();
      const { desktop, ids } = await withWindows(2);
      desktop.minimizeWindow(ids[0]);
      await flushPromises();

      await tab();
      await release();

      expect(desktop.focusedId).toBe(ids[0]);
      expect(desktop.find(ids[0])!.minimized).toBe(false);
    });

    it('bricht mit Escape ab, ohne das Fenster zu wechseln', async () => {
      const { wrapper } = await mountView();
      const { desktop, ids } = await withWindows(2);

      await tab();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();

      expect(wrapper.findComponent(SwitcherOverlay).exists()).toBe(false);
      await release();
      expect(desktop.focusedId).toBe(ids[1]); // das zuletzt geöffnete blieb vorn
    });

    it('tut mit einem oder keinem Fenster nichts', async () => {
      const { wrapper } = await mountView();
      await tab();
      expect(wrapper.findComponent(SwitcherOverlay).exists()).toBe(false);

      const { desktop, ids } = await withWindows(1);
      await tab();
      expect(wrapper.findComponent(SwitcherOverlay).exists()).toBe(false);
      await release();
      expect(desktop.focusedId).toBe(ids[0]);
    });

    it('bleibt still, während in der Promptleiste getippt wird', async () => {
      const { wrapper } = await mountView({ attach: true });
      await withWindows(2);

      wrapper
        .get('textarea')
        .element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }));
      await flushPromises();

      expect(wrapper.findComponent(SwitcherOverlay).exists()).toBe(false);
      wrapper.unmount();
    });

    it('wechselt auch zu einem angeklickten Fenster der Auswahl', async () => {
      const { wrapper } = await mountView();
      const { desktop, ids } = await withWindows(3);

      await tab();
      await wrapper.findAll('.sw-item')[2].trigger('click');
      await flushPromises();

      expect(wrapper.findComponent(SwitcherOverlay).exists()).toBe(false);
      expect(desktop.focusedId).toBe(ids[0]); // der Rechner, ganz hinten
    });
  });

  describe('Datei-Explorer (System-Fenster)', () => {
    /** Öffnet den Explorer über den Knopf auf dem Desktop. */
    async function openExplorer(wrapper: VueWrapper) {
      await wrapper.get('.files-btn').trigger('click');
      await flushPromises();
    }

    it('öffnet den Explorer als Fenster im Fenstermanager', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.findComponent(SystemWindow).exists()).toBe(false);

      await openExplorer(wrapper);

      const desktop = useDesktopStore();
      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0]).toMatchObject({ kind: 'system', systemId: EXPLORER_ID, appId: null });
      // Ein Fenster mit Rahmen, aber ohne erzeugte App darin.
      const frame = wrapper.getComponent(SystemWindow);
      expect(frame.findComponent(WindowFrame).exists()).toBe(true);
      expect(frame.findComponent(ExplorerPanel).exists()).toBe(true);
      expect(wrapper.findAllComponents(AppWindow)).toHaveLength(0);
    });

    it('holt beim erneuten Öffnen das bestehende Fenster nach vorn (nur eines)', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      await openExplorer(wrapper);
      const instanceId = desktop.windows[0].instanceId;

      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();
      expect(desktop.focusedId).not.toBe(instanceId);

      await openExplorer(wrapper);

      expect(wrapper.findAllComponents(SystemWindow)).toHaveLength(1);
      expect(desktop.windows).toHaveLength(2);
      expect(desktop.focusedId).toBe(instanceId);
    });

    it('öffnet ihn auch aus der Suchleiste heraus', async () => {
      const { wrapper } = await mountView();
      await wrapper.get('.search-btn').trigger('click');
      await flushPromises();
      expect(wrapper.get('.lp-list').text()).toContain('Dateien');

      await wrapper.get('.lp-input').setValue('dateien');
      await wrapper.get('.lp-input').trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(false);
      expect(useDesktopStore().windows[0].systemId).toBe(EXPLORER_ID);
    });

    it('legt sich minimiert ins Dock und kommt von dort zurück', async () => {
      const { wrapper } = await mountView();
      await openExplorer(wrapper);

      await wrapper.get('.w-min').trigger('click');
      await flushPromises();
      expect(wrapper.get('.dock').text()).toContain('Dateien');

      await wrapper.get('.dock-item').trigger('click');
      await flushPromises();
      expect(useDesktopStore().windows[0].minimized).toBe(false);
    });

    it('steht wie eine App im Fensterwechsler', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const app = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await openExplorer(wrapper);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }));
      await flushPromises();

      const overlay = wrapper.getComponent(SwitcherOverlay);
      expect(overlay.props('windows').map((w: { title: string }) => w.title)).toEqual([
        'Dateien',
        'Rechner',
      ]);

      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
      await flushPromises();
      expect(desktop.focusedId).toBe(app);
    });

    it('füllt im Einzel-Modus die Fläche und lässt sich verlassen', async () => {
      useWorkspaceStore().uiMode = 'single';
      const { wrapper } = await mountView();
      await openExplorer(wrapper);

      const frame = wrapper.getComponent(SystemWindow);
      expect(frame.props('single')).toBe(true);
      expect(frame.get('.window-frame').classes()).toContain('full');

      await wrapper.get('.w-desktop').trigger('click');
      await flushPromises();

      // Zurück auf dem Desktop — das Fenster wartet im Dock.
      expect(wrapper.findComponent(SystemWindow).exists()).toBe(false);
      expect(wrapper.get('.dock').text()).toContain('Dateien');
    });

    it('nimmt keine Wünsche entgegen — die Promptleiste legt eine neue App an', async () => {
      const { wrapper } = await mountView();
      await openExplorer(wrapper);
      const spy = vi.spyOn(useAgentsStore(), 'submitToActive').mockReturnValue('job-1');

      expect(useDesktopStore().activeAppId).toBeNull();
      expect(wrapper.get('.chat-context').text()).toContain('Neue App');

      await wrapper.get('textarea').setValue('Ein Spiel');
      await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
      expect(spy).toHaveBeenCalledWith('Ein Spiel', []);
    });

    it('wird nicht in der Sitzung gemerkt (nur Apps kommen zurück)', async () => {
      const { wrapper } = await mountView();
      await openExplorer(wrapper);
      expect(useWorkspaceStore().session).toEqual([]);
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
