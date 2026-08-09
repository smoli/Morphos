import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
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
import { useAgentsStore } from '@/stores/agents';
import { useAppWindow } from '@/stores/app';
import { setHost } from '@/services/host';
import { columns, slotPos } from '@/core/arrange';
import { EXPLORER_ID, SETTINGS_ID, SYSTEM_WINDOWS, systemWindow } from '@/core/system';
import { DEFAULT_WALLPAPER, wallpaperCss } from '@/core/wallpaper';
import {
  DEFAULT_DOCK_BLUR,
  DEFAULT_DOCK_TRANSPARENCY,
  dockBackgroundCss,
  dockBlurCss,
} from '@/core/transparency';
import { DEFAULT_DOCK_EDGE } from '@/core/dock';
import { DOCK_RESERVE } from '@/core/workarea';
import { TILE_GAP } from '@/stores/desktop';
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
    mounted.push(wrapper);
    await flushPromises();
    return { wrapper, router };
  }

  // Jede Ansicht wird nach ihrem Test wieder abgebaut. Sonst hört ihr
  // Tastenhorcher weiter mit und greift in den nächsten Test hinein — und mit
  // der ersten Aktion auf ihrem alten Store zeigt Pinia auch wieder auf dessen
  // Verzeichnis.
  const mounted: VueWrapper[] = [];
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
  });

  /** Die Kachel-Hülle einer App auf dem Desktop. */
  function tileWrap(wrapper: VueWrapper, name: string) {
    return wrapper.findAll('.tile-wrap').find((t) => t.text().includes(name))!;
  }

  /**
   * Ein Platz im Dock. Er trägt nur die Glyphe — gesucht wird darum über den
   * Namen im Tooltip (das feste ＋ nennt daneben sein Tastenkürzel).
   */
  function dockItem(wrapper: VueWrapper, name: string) {
    return wrapper.findAll('.dock-item').find((d) => d.attributes('title') === name)!;
  }

  /**
   * Die Namen der App-Plätze im Dock, von links nach rechts — ohne das feste ＋
   * und ohne die festen Ansichten der Schale (dafür: dockSystemNames).
   */
  function dockNames(wrapper: VueWrapper): string[] {
    return wrapper
      .findAll('.dock-item:not(.new):not(.system)')
      .map((d) => d.attributes('title') ?? '');
  }

  /** Die festen Plätze der Schale im Dock (Dateien, Einstellungen). */
  function dockSystemNames(wrapper: VueWrapper): string[] {
    return wrapper.findAll('.dock-item.system').map((d) => d.attributes('title') ?? '');
  }

  /**
   * Die Fenster, die wirklich zu sehen sind. Offen heißt nicht sichtbar: Jedes
   * offene Fenster bleibt aufgebaut (sonst lüde seine App neu, i0005) — was
   * gerade nicht drankommt, ist nur ausgeblendet.
   */
  function visibleFrames(wrapper: VueWrapper) {
    return wrapper
      .findAllComponents(WindowFrame)
      .filter((f) => (f.element as HTMLElement).style.display !== 'none');
  }

  /**
   * Was der <style>-Block dieser Ansicht über einen Wähler sagt. jsdom rechnet
   * kein CSS einer SFC aus — für die paar Aussagen, die am Aussehen hängen
   * (rollt das Dock? wohin legt es sich?), wird es darum im Quelltext
   * nachgeschlagen: alle Regeln, die diesen Wähler führen — auch als einer von
   * mehreren vor der Klammer —, hintereinander.
   */
  function styleRule(selector: string): string {
    const source = readFileSync('src/views/DesktopView.vue', 'utf8');
    // Nur der Stil-Teil, und ohne Kommentare — sonst stünde deren Text mit vor
    // der Klammer und keine Regel wäre mehr wiederzuerkennen.
    const styles = source.slice(source.indexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, '');
    const bodies: string[] = [];
    for (const rule of styles.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (rule[1].split(',').some((s) => s.trim() === selector)) bodies.push(rule[2]);
    }
    if (!bodies.length) throw new Error(`Keine CSS-Regel für ${selector} in DesktopView.vue`);
    return bodies.join('');
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

  it('zeigt eine Kachel je App — das ＋ steht im Dock, nicht mehr im Raster', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Rechner');
    expect(wrapper.text()).toContain('Editor');
    // Nur noch die Apps liegen auf der Fläche.
    expect(wrapper.findAll('.tile')).toHaveLength(2);
    expect(wrapper.find('.tile.new').exists()).toBe(false);
    expect(wrapper.get('.dock-item.new').text()).toBe('＋');
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
    await wrapper.get('.dock-item.new').trigger('click');
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
    expect(dockNames(wrapper)).toEqual(['Rechner']);

    await dockItem(wrapper, 'Rechner').trigger('click');
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
      expect(dockItem(wrapper, 'Rechner').find('.busy-dot').exists()).toBe(true);
    });
  });

  describe('Chat auf Zuruf statt Promptleiste', () => {
    it('hat keine feste Promptleiste mehr — der Desktop trägt keine Eingabe', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.find('.prompt-wrap').exists()).toBe(false);
      expect(wrapper.find('textarea').exists()).toBe(false);
      expect(wrapper.find('.chat-context').exists()).toBe(false);
    });

    it('öffnet den Chat des aktiven Fensters per Tastenkürzel und schließt ihn wieder', async () => {
      setHost(makeHost({ loadApp: vi.fn(async () => rechnerData) }));
      const { wrapper } = await mountView();
      const instanceId = useDesktopStore().openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();
      expect(wrapper.find('.w-composer').exists()).toBe(false);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', metaKey: true, shiftKey: true }));
      await flushPromises();

      expect(useAppWindow(instanceId).composerOpen).toBe(true);
      expect(wrapper.get('.w-composer').find('textarea').exists()).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', metaKey: true, shiftKey: true }));
      await flushPromises();
      expect(wrapper.find('.w-composer').exists()).toBe(false);
    });

    it('schließt ihn mit Escape', async () => {
      setHost(makeHost({ loadApp: vi.fn(async () => rechnerData) }));
      const { wrapper } = await mountView();
      const instanceId = useDesktopStore().openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();
      useAppWindow(instanceId).openComposer();
      await flushPromises();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();

      expect(useAppWindow(instanceId).composerOpen).toBe(false);
      expect(wrapper.find('.w-composer').exists()).toBe(false);
    });

    it('greift ohne App im Vordergrund ins Leere (statt irgendwo aufzugehen)', async () => {
      const { wrapper } = await mountView();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', metaKey: true, shiftKey: true }));
      await flushPromises();
      expect(wrapper.find('.w-composer').exists()).toBe(false);
    });

    it('öffnet eine neue App mit offenem Chat', async () => {
      const { wrapper } = await mountView();

      await wrapper.get('.dock-item.new').trigger('click');
      await flushPromises();

      const instanceId = useDesktopStore().windows[0].instanceId;
      expect(useAppWindow(instanceId).composerOpen).toBe(true);
      expect(wrapper.get('.w-composer').find('textarea').exists()).toBe(true);
    });

    it('schickt den Wunsch aus dem Chat an das Fenster, an dem er hängt', async () => {
      const { wrapper } = await mountView();
      const spy = vi.spyOn(useAgentsStore(), 'submit').mockReturnValue('job-1');

      await wrapper.get('.dock-item.new').trigger('click');
      await flushPromises();
      const instanceId = useDesktopStore().windows[0].instanceId;

      await wrapper.get('.w-composer textarea').setValue('Ein Spiel');
      await wrapper.get('.w-composer textarea').trigger('keydown', { key: 'Enter' });

      expect(spy).toHaveBeenCalledWith(instanceId, 'Ein Spiel', []);
    });
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

    it('zeigt ein Bild-Icon als Bild — auf der Kachel und in der Titelleiste', async () => {
      setHost(makeHost({
        listApps: vi.fn(async () => [{ ...apps[0], icon: IMAGE_ICON, iconCustom: true }, apps[1]]),
        loadApp: vi.fn(async () => ({ ...rechnerData, icon: IMAGE_ICON, iconCustom: true })),
      }));
      const { wrapper } = await mountView();
      useDesktopStore().openApp('rechner-1', { title: 'Rechner', icon: IMAGE_ICON });
      await flushPromises();

      const tile = wrapper.findAll('.tile-wrap').find((t) => t.text().includes('Rechner'))!;
      expect(tile.get('.tile img').attributes('src')).toBe(IMAGE_ICON);
      expect(wrapper.get('.w-icon img').attributes('src')).toBe(IMAGE_ICON);
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

      await dockItem(wrapper, 'Rechner').trigger('contextmenu', { clientX: 40, clientY: 700 });
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

  describe('Dock wie am Mac', () => {
    /** Die Lieblinge dieses Verzeichnisses setzen (wie aus den Einstellungen gelesen). */
    function keep(...ids: string[]) {
      useWorkspaceStore().favorites = { '/apps': ids };
    }

    it('steht auch leer da — das ＋ ist immer dabei', async () => {
      const { wrapper } = await mountView();
      expect(wrapper.find('.dock-item.new').exists()).toBe(true);
      expect(dockNames(wrapper)).toEqual([]);
    });

    it('rollt nicht — auch leer trägt es keine Bildlaufleiste (i0004)', () => {
      const rule = styleRule('.dock');
      // Die Namensblasen hängen (unsichtbar) über den Icons und ragen aus der
      // Leiste heraus. Darf sie rollen, zeigt sie deshalb dauerhaft einen
      // Balken — selbst wenn nur das ＋ dasteht.
      expect(rule).not.toMatch(/overflow[a-z-]*:\s*(auto|scroll)/);
      // Passt nicht alles in eine Reihe, bricht das Dock um, statt zu rollen.
      expect(rule).toMatch(/flex-wrap:\s*wrap/);
    });

    it('ist so durchsichtig, wie es die Einstellungen sagen', async () => {
      const { wrapper } = await mountView();
      const ws = useWorkspaceStore();
      // Ohne eigenen Wert die Vorgabe …
      expect(wrapper.get('.dock').attributes('style')).toContain(
        dockBackgroundCss(DEFAULT_DOCK_TRANSPARENCY),
      );

      ws.setDockTransparency(0.85);
      await flushPromises();

      // … und danach der gewählte.
      expect(wrapper.get('.dock').attributes('style')).toContain(dockBackgroundCss(0.85));
    });

    it('trägt den Milchglas-Schleier aus den Einstellungen', async () => {
      const { wrapper } = await mountView();
      const ws = useWorkspaceStore();
      // Ohne eigenen Wert die Vorgabe …
      expect(wrapper.get('.dock').attributes('style')).toContain(dockBlurCss(DEFAULT_DOCK_BLUR));

      ws.setDockBlur(3);
      await flushPromises();

      // … und danach der gewählte.
      expect(wrapper.get('.dock').attributes('style')).toContain(dockBlurCss(3));
    });

    it('steht ohne Ausblenden fest — und legt sich mit ihm unter den Rand (c0062)', async () => {
      const { wrapper } = await mountView();
      const ws = useWorkspaceStore();
      expect(wrapper.get('.dock').classes()).not.toContain('hidden');
      // Ohne Ausblenden gibt es auch nichts, woran es hervorkäme.
      expect(wrapper.find('.dock-zone').exists()).toBe(false);

      ws.setDockAutohide(true);
      await flushPromises();

      expect(wrapper.get('.dock').classes()).toContain('hidden');
      expect(wrapper.find('.dock-zone').exists()).toBe(true);
    });

    it('kommt hervor, wenn der Zeiger den unteren Rand erreicht — und legt sich danach wieder hin', async () => {
      const { wrapper } = await mountView();
      useWorkspaceStore().setDockAutohide(true);
      await flushPromises();

      await wrapper.get('.dock-zone').trigger('mouseenter');
      expect(wrapper.get('.dock').classes()).not.toContain('hidden');

      await wrapper.get('.dock').trigger('mouseleave');
      expect(wrapper.get('.dock').classes()).toContain('hidden');
    });

    it('kommt auch hervor, wenn die Tastatur hineinfindet', async () => {
      const { wrapper } = await mountView();
      useWorkspaceStore().setDockAutohide(true);
      await flushPromises();

      await wrapper.get('.dock').trigger('focusin');
      expect(wrapper.get('.dock').classes()).not.toContain('hidden');

      await wrapper.get('.dock').trigger('focusout');
      expect(wrapper.get('.dock').classes()).toContain('hidden');
    });

    it('bleibt stehen, solange das Menü eines Platzes offen ist', async () => {
      keep('rechner-1');
      const { wrapper } = await mountView();
      useWorkspaceStore().setDockAutohide(true);
      await flushPromises();

      await dockItem(wrapper, 'Rechner').trigger('contextmenu', { clientX: 40, clientY: 700 });
      // Der Zeiger ist im Menü, also nicht mehr auf der Leiste — sie zöge sich
      // sonst unter ihrem eigenen Menü weg.
      await wrapper.get('.dock').trigger('mouseleave');
      expect(wrapper.get('.dock').classes()).not.toContain('hidden');

      await wrapper.getComponent(ContextMenu).vm.$emit('close');
      await flushPromises();
      expect(wrapper.get('.dock').classes()).toContain('hidden');
    });

    it('nimmt ausgeblendet keine Klicks an', () => {
      // Nur der Randstreifen ist dann noch anzufassen — die Leiste liegt
      // darunter und darf dem Desktop nicht im Weg stehen.
      expect(styleRule('.dock.hidden')).toMatch(/pointer-events:\s*none/);
    });

    describe('Der Rand, an dem das Dock steht (c0063)', () => {
      it('steht von Haus aus unten und rückt an den gewählten Rand', async () => {
        const { wrapper } = await mountView();
        const ws = useWorkspaceStore();
        expect(wrapper.get('.dock').classes()).toContain(`edge-${DEFAULT_DOCK_EDGE}`);

        ws.setDockEdge('left');
        await flushPromises();

        expect(wrapper.get('.dock').classes()).toContain('edge-left');
        expect(wrapper.get('.dock').classes()).not.toContain('edge-bottom');
      });

      it('legt den Randstreifen an denselben Rand', async () => {
        const { wrapper } = await mountView();
        const ws = useWorkspaceStore();
        ws.setDockAutohide(true);
        ws.setDockEdge('top');
        await flushPromises();

        expect(wrapper.get('.dock-zone').classes()).toContain('edge-top');
      });

      it('kommt an jedem Rand hervor, wenn der Zeiger dort ankommt', async () => {
        const { wrapper } = await mountView();
        const ws = useWorkspaceStore();
        ws.setDockAutohide(true);
        ws.setDockEdge('right');
        await flushPromises();
        expect(wrapper.get('.dock').classes()).toContain('hidden');

        await wrapper.get('.dock-zone').trigger('mouseenter');
        expect(wrapper.get('.dock').classes()).not.toContain('hidden');
      });

      for (const edge of ['bottom', 'left', 'right', 'top']) {
        it(`weiß, wie es am Rand „${edge}“ steht — und wohin es sich dort legt`, () => {
          // Die Leiste sitzt an diesem Rand …
          expect(styleRule(`.dock.edge-${edge}`)).toMatch(new RegExp(`${edge}:\\s*14px`));
          // … und rückt ausgeblendet über genau ihn hinaus.
          expect(styleRule(`.dock.edge-${edge}.hidden`)).toMatch(/transform:\s*translate/);
        });
      }

      it('stellt die Glyphen hochkant, wenn es an der Seite steht', () => {
        expect(styleRule('.dock.edge-left')).toMatch(/flex-direction:\s*column/);
        expect(styleRule('.dock.edge-right')).toMatch(/flex-direction:\s*column/);
        // Hochkant begrenzt die Höhe, nicht die Breite (sonst bricht nichts um).
        expect(styleRule('.dock.edge-left')).toMatch(/max-height:/);
      });

      it('hängt die Namensblase auf die Seite, an der Platz ist', () => {
        // Unten hängt sie über dem Icon (Vorgabe) — an den anderen Rändern
        // stünde sie sonst außerhalb des Bildes.
        expect(styleRule('.dock.edge-top .dock-name')).toMatch(/top:\s*100%/);
        expect(styleRule('.dock.edge-left .dock-name')).toMatch(/left:\s*100%/);
        expect(styleRule('.dock.edge-right .dock-name')).toMatch(/right:\s*100%/);
      });

      it('macht der Fläche Platz, wo das Dock sonst die ersten Kacheln verdeckte', async () => {
        const { wrapper } = await mountView();
        const ws = useWorkspaceStore();
        // Unten liegt die Leiste über der Fläche wie eh und je (c0052).
        expect(wrapper.get('.launcher').classes()).not.toContain('reserve-bottom');

        ws.setDockEdge('left');
        await flushPromises();
        expect(wrapper.get('.launcher').classes()).toContain('reserve-left');
        expect(styleRule('.launcher.reserve-left')).toMatch(/left:/);

        // Ausgeblendet steht die Leiste nicht im Weg — dann gibt sie den Platz her.
        ws.setDockAutohide(true);
        await flushPromises();
        expect(wrapper.get('.launcher').classes()).not.toContain('reserve-left');
      });
    });

    describe('Das feste Dock legt sich nicht über die Fenster (i0006)', () => {
      /** Die angeschriebenen Ränder der Bühne — daran hängt die Arbeitsfläche. */
      function workVars(wrapper: VueWrapper): Record<string, string> {
        const style = (wrapper.get('.stage').element as HTMLElement).style;
        return {
          top: style.getPropertyValue('--work-top'),
          right: style.getPropertyValue('--work-right'),
          bottom: style.getPropertyValue('--work-bottom'),
          left: style.getPropertyValue('--work-left'),
        };
      }

      /**
       * jsdom rechnet kein Layout aus — die Bühne bekommt ihre Größe von Hand,
       * danach misst die Ansicht auf das Fenster-Ereignis hin nach.
       */
      async function measureStage(wrapper: VueWrapper, w = 1200, h = 800) {
        const stage = wrapper.get('.stage').element as HTMLElement;
        Object.defineProperty(stage, 'clientWidth', { value: w, configurable: true });
        Object.defineProperty(stage, 'clientHeight', { value: h, configurable: true });
        window.dispatchEvent(new Event('resize'));
        await flushPromises();
      }

      it('schreibt an, welchen Rand die Leiste für sich behält', async () => {
        const { wrapper } = await mountView();
        const ws = useWorkspaceStore();
        // Unten (die Vorgabe): Ein Fenster, das die Fläche füllt, endet über der
        // Leiste statt unter ihr.
        expect(workVars(wrapper)).toEqual({
          top: '0px',
          right: '0px',
          bottom: `${DOCK_RESERVE}px`,
          left: '0px',
        });

        ws.setDockEdge('right');
        await flushPromises();
        expect(workVars(wrapper).right).toBe(`${DOCK_RESERVE}px`);
        expect(workVars(wrapper).bottom).toBe('0px');
      });

      it('gibt den Rand her, sobald die Leiste sich aus dem Weg legt', async () => {
        const { wrapper } = await mountView();
        useWorkspaceStore().setDockAutohide(true);
        await flushPromises();

        expect(workVars(wrapper).bottom).toBe('0px');
      });

      it('gibt im Einzel-Modus alles her — dort ist die Leiste ohnehin weg', async () => {
        useWorkspaceStore().uiMode = 'single';
        const { wrapper } = await mountView();
        useDesktopStore().openSystem(EXPLORER_ID);
        await flushPromises();

        expect(wrapper.find('.dock').exists()).toBe(false);
        expect(workVars(wrapper).bottom).toBe('0px');
      });

      it('lässt dem Kachel-Verbund nur den Platz über der Leiste', async () => {
        const { wrapper } = await mountView();
        const desktop = useDesktopStore();
        await measureStage(wrapper);

        // Die Fläche ist der Bildschirm ohne den Rand der Leiste, ringsum um
        // eine Fuge eingerückt.
        expect(desktop.tileArea).toEqual({
          x: TILE_GAP,
          y: TILE_GAP,
          w: 1200 - 2 * TILE_GAP,
          h: 800 - DOCK_RESERVE - 2 * TILE_GAP,
        });

        // Ausgeblendet gehört die ganze Fläche wieder den Kacheln.
        useWorkspaceStore().setDockAutohide(true);
        await flushPromises();
        expect(desktop.tileArea.h).toBe(800 - 2 * TILE_GAP);

        // An der Seite wird die Fläche schmaler statt niedriger.
        useWorkspaceStore().setDockAutohide(false);
        useWorkspaceStore().setDockEdge('left');
        await flushPromises();
        expect(desktop.tileArea).toEqual({
          x: DOCK_RESERVE + TILE_GAP,
          y: TILE_GAP,
          w: 1200 - DOCK_RESERVE - 2 * TILE_GAP,
          h: 800 - 2 * TILE_GAP,
        });
      });

      it('kachelt die Fenster in diese Fläche — keines liegt unter der Leiste', async () => {
        const { wrapper } = await mountView();
        const desktop = useDesktopStore();
        desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
        desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
        useWorkspaceStore().uiMode = 'tiles';
        await measureStage(wrapper);

        const frames = wrapper
          .findAllComponents(WindowFrame)
          .map((f) => (f.element as HTMLElement).style);
        expect(frames).toHaveLength(2);
        for (const s of frames) {
          // Beide reichen von oben bis an die Fuge über der Leiste — und keiner
          // darüber hinaus.
          expect(parseFloat(s.height)).toBeGreaterThan(0);
          expect(parseFloat(s.top) + parseFloat(s.height)).toBe(800 - DOCK_RESERVE - TILE_GAP);
        }
      });

      it('rückt den vollflächigen Rahmen um dieselben Ränder ein', () => {
        // Maximiert und im Einzel-Modus füllt der Rahmen die Fläche — die
        // angeschriebenen Ränder sagen, wo sie aufhört.
        const source = readFileSync('src/components/WindowFrame.vue', 'utf8');
        const full = source.slice(source.indexOf('.window-frame.full'));
        expect(full.slice(0, full.indexOf('}'))).toMatch(
          /inset:\s*var\(--work-top[^)]*\)\s*var\(--work-right[^)]*\)\s*var\(--work-bottom[^)]*\)\s*var\(--work-left[^)]*\)/,
        );
      });
    });

    it('reiht auf: erst die Lieblinge, dann das Laufende', async () => {
      keep('editor-2');
      const { wrapper } = await mountView();
      useDesktopStore().openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      // Das feste ＋ steht vor allem anderen.
      expect(wrapper.findAll('.dock-item')[0].classes()).toContain('new');
      expect(dockNames(wrapper)).toEqual(['Editor', 'Rechner']);
    });

    it('zeigt eine App, die läuft UND behalten wird, nur einmal', async () => {
      keep('rechner-1', 'editor-2');
      const { wrapper } = await mountView();
      useDesktopStore().openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      expect(dockNames(wrapper)).toEqual(['Rechner', 'Editor']);
    });

    it('markiert mit einem Laufpunkt, was gerade offen ist', async () => {
      keep('editor-2');
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      expect(dockItem(wrapper, 'Rechner').find('.dock-dot').exists()).toBe(true);
      // Der Liebling, der nicht läuft, bleibt ohne.
      expect(dockItem(wrapper, 'Editor').find('.dock-dot').exists()).toBe(false);

      // Minimiert läuft die App weiter — der Punkt bleibt.
      desktop.minimizeWindow(instanceId);
      await flushPromises();
      expect(dockItem(wrapper, 'Rechner').find('.dock-dot').exists()).toBe(true);

      desktop.closeWindow(instanceId);
      await flushPromises();
      expect(dockNames(wrapper)).toEqual(['Editor']);
    });

    it('trägt Icon und Namen — den Namen als Tooltip, sichtbar beim Überfahren', async () => {
      keep('rechner-1');
      const { wrapper } = await mountView();
      const item = dockItem(wrapper, 'Rechner');
      expect(item.get('.dock-glyph').text()).toBe('🧮');
      expect(item.get('.dock-name').text()).toBe('Rechner');
    });

    it('zeigt ein Bild-Icon auch im Dock als Bild', async () => {
      setHost(makeHost({ listApps: vi.fn(async () => [{ ...apps[0], icon: IMAGE_ICON, iconCustom: true }, apps[1]]) }));
      keep('rechner-1');
      const { wrapper } = await mountView();
      expect(dockItem(wrapper, 'Rechner').get('img').attributes('src')).toBe(IMAGE_ICON);
    });

    it('öffnet einen Liebling, der nicht läuft, per Klick', async () => {
      keep('rechner-1');
      const { wrapper } = await mountView();

      await dockItem(wrapper, 'Rechner').trigger('click');
      await flushPromises();

      const desktop = useDesktopStore();
      expect(desktop.windows.map((w) => w.appId)).toEqual(['rechner-1']);
      expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(1);
    });

    it('holt ein minimiertes Fenster zurück — und minimiert es beim zweiten Klick NICHT', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.minimizeWindow(instanceId);
      await flushPromises();

      await dockItem(wrapper, 'Rechner').trigger('click');
      await flushPromises();
      expect(desktop.find(instanceId)!.minimized).toBe(false);

      await dockItem(wrapper, 'Rechner').trigger('click');
      await flushPromises();
      expect(desktop.find(instanceId)!.minimized).toBe(false);
      expect(desktop.focusedId).toBe(instanceId);
      // Und es bleibt bei dem einen Fenster.
      expect(desktop.windows).toHaveLength(1);
    });

    it('holt eine laufende App nach vorn, statt sie zweimal zu öffnen', async () => {
      keep('rechner-1');
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await flushPromises();

      await dockItem(wrapper, 'Rechner').trigger('click');
      await flushPromises();

      expect(desktop.windows).toHaveLength(2);
      expect(desktop.focusedId).toBe(instanceId);
    });

    it('nimmt eine laufende App über ihr Dock-Menü dauerhaft ins Dock — und merkt es je Verzeichnis', async () => {
      const host = makeHost();
      setHost(host);
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      await dockItem(wrapper, 'Rechner').trigger('contextmenu', { clientX: 40, clientY: 700 });
      await pickMenu(wrapper, 'Im Dock behalten');

      expect(useWorkspaceStore().favorites).toEqual({ '/apps': ['rechner-1'] });
      expect(host.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ favorites: { '/apps': ['rechner-1'] } }),
      );

      // Geschlossen bleibt sie im Dock stehen.
      desktop.closeWindow(instanceId);
      await flushPromises();
      expect(dockNames(wrapper)).toEqual(['Rechner']);

      // Und wieder heraus.
      await dockItem(wrapper, 'Rechner').trigger('contextmenu', { clientX: 40, clientY: 700 });
      await pickMenu(wrapper, 'Aus dem Dock entfernen');
      expect(dockNames(wrapper)).toEqual([]);
    });

    it('bietet an einem Fenster ohne App nichts zum Behalten an', async () => {
      const { wrapper } = await mountView();
      useDesktopStore().openSystem(EXPLORER_ID);
      await flushPromises();

      await dockItem(wrapper, 'Dateien').trigger('contextmenu', { clientX: 40, clientY: 700 });
      await flushPromises();

      expect(wrapper.findComponent(ContextMenu).exists()).toBe(false);
    });

    it('hält Dateien und Einstellungen dauerhaft vorn — auch ohne Lieblinge', async () => {
      const { wrapper } = await mountView();

      expect(dockSystemNames(wrapper)).toEqual(SYSTEM_WINDOWS.map((s) => s.title));
      expect(dockNames(wrapper)).toEqual([]);
      // Erst das ＋, dann die Plätze der Schale, dann alles andere.
      const titles = wrapper.findAll('.dock-item').map((d) => d.attributes('title'));
      expect(titles[0]).toContain('Neue App');
      expect(titles.slice(1, 1 + SYSTEM_WINDOWS.length)).toEqual(SYSTEM_WINDOWS.map((s) => s.title));
      // Solange nichts folgt, steht nur der Strich hinter dem ＋.
      expect(wrapper.findAll('.dock .dock-sep')).toHaveLength(1);
    });

    it('stellt sie vor die Lieblinge und das Laufende', async () => {
      keep('editor-2');
      const { wrapper } = await mountView();
      useDesktopStore().openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      expect(wrapper.findAll('.dock-item:not(.new)').map((d) => d.attributes('title'))).toEqual([
        ...SYSTEM_WINDOWS.map((s) => s.title),
        'Editor',
        'Rechner',
      ]);
      // Jetzt setzt ein zweiter Strich die festen Plätze von den Apps ab.
      expect(wrapper.findAll('.dock .dock-sep')).toHaveLength(2);
    });

    it('öffnet die Einstellungen aus dem Dock — und holt sie beim zweiten Klick nur vor', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const settings = dockItem(wrapper, systemWindow(SETTINGS_ID)!.title);
      expect(settings.find('.dock-dot').exists()).toBe(false);

      await settings.trigger('click');
      await flushPromises();

      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0].systemId).toBe(SETTINGS_ID);
      expect(wrapper.getComponent(SystemWindow).find('.settings-panel').exists()).toBe(true);
      expect(dockItem(wrapper, systemWindow(SETTINGS_ID)!.title).find('.dock-dot').exists()).toBe(true);

      const instanceId = desktop.windows[0].instanceId;
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();
      await dockItem(wrapper, systemWindow(SETTINGS_ID)!.title).trigger('click');
      await flushPromises();

      expect(desktop.windows).toHaveLength(2);
      expect(desktop.focusedId).toBe(instanceId);
    });

    it('lässt die festen Plätze nicht behalten oder entfernen', async () => {
      const { wrapper } = await mountView();

      for (const name of dockSystemNames(wrapper)) {
        await dockItem(wrapper, name).trigger('contextmenu', { clientX: 40, clientY: 700 });
        await flushPromises();
        expect(wrapper.findComponent(ContextMenu).exists()).toBe(false);
      }
    });

    it('vergisst den Liebling einer gelöschten App', async () => {
      keep('rechner-1');
      const { wrapper } = await mountView();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      setHost(makeHost({ listApps: vi.fn(async () => [apps[1]]) }));

      await openIconMenu(wrapper, 'Rechner');
      await pickMenu(wrapper, 'Löschen');

      expect(useWorkspaceStore().favoriteIds).toEqual([]);
      expect(dockNames(wrapper)).toEqual([]);
      vi.restoreAllMocks();
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

    it('legt Apps ohne gemerkte Position ins Raster — ab dem ersten Platz', async () => {
      const { wrapper } = await mountView();
      const rechner = tileOf(wrapper, 'Rechner');
      const editor = tileOf(wrapper, 'Editor');
      // Seit das ＋ im Dock steht, ist auch der erste Rasterplatz frei.
      expect({ x: rechner.x, y: rechner.y }).toEqual(slotPos(0, cols));
      expect({ x: editor.x, y: editor.y }).toEqual(slotPos(1, cols));
    });

    it('stellt eine gemerkte Position wieder her', async () => {
      const ws = useWorkspaceStore();
      ws.iconPositions = { '/apps': { 'rechner-1': { x: 300, y: 220 } } };
      const { wrapper } = await mountView();

      expect(tileOf(wrapper, 'Rechner')).toMatchObject({ x: 300, y: 220 });
      // Der freie Platz im Raster bleibt für die übrigen Kacheln.
      expect(tileOf(wrapper, 'Editor')).toMatchObject(slotPos(0, cols));
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
      expect(tileOf(wrapper, 'Rechner')).toMatchObject(slotPos(0, cols));
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
      expect(wrapper.findAll('.tile')).toHaveLength(2);
    });
  });

  describe('Fensterwechsel lädt die Apps nicht neu (i0005)', () => {
    /** Die Fenster-Knoten der Bühne, in der Reihenfolge des DOM. */
    function windowNodes(wrapper: VueWrapper): Element[] {
      return Array.from(wrapper.get('.windows-layer').element.children);
    }

    /** Der Rahmen eines Fensters, gesucht über die App, die es zeigt. */
    function frameOf(wrapper: VueWrapper, appId: string): HTMLElement {
      const frame = wrapper.findAllComponents(WindowFrame).find((f) => f.props('win').appId === appId);
      if (!frame) throw new Error(`Kein Fenster für ${appId}`);
      return frame.element as HTMLElement;
    }

    /** Sind es Knoten für Knoten dieselben Elemente wie vorher? */
    function sameNodes(nodes: Element[], before: Element[]): boolean[] {
      return nodes.map((node, i) => node === before[i]);
    }

    it('rührt die Reihenfolge der Fenster im DOM nicht an — der Stapel liegt im z-index', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const rechner = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await flushPromises();
      const before = windowNodes(wrapper);
      expect(before).toHaveLength(2);

      desktop.focusWindow(rechner);
      await flushPromises();

      // Dieselben Knoten an derselben Stelle: Ein umgehängtes iframe lädt sein
      // Dokument neu — die laufende App fienge von vorn an.
      expect(sameNodes(windowNodes(wrapper), before)).toEqual([true, true]);
      // Vorn liegt der Rechner trotzdem — das sagt allein der z-index.
      const z = (el: HTMLElement) => Number(el.style.zIndex);
      expect(z(frameOf(wrapper, 'rechner-1'))).toBeGreaterThan(z(frameOf(wrapper, 'editor-2')));
    });

    it('baut im Einzel-Modus das verlassene Fenster nicht ab, sondern blendet es aus', async () => {
      useWorkspaceStore().uiMode = 'single';
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const rechner = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      const editor = desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await flushPromises();
      const rechnerFrame = frameOf(wrapper, 'rechner-1');

      desktop.focusWindow(rechner);
      await flushPromises();
      desktop.focusWindow(editor);
      await flushPromises();

      // Derselbe Knoten wie zu Beginn — der Rechner wurde nie abgebaut.
      expect(frameOf(wrapper, 'rechner-1')).toBe(rechnerFrame);
      // Zu sehen ist nur das aktive Fenster.
      expect(rechnerFrame.style.display).toBe('none');
      expect(frameOf(wrapper, 'editor-2').style.display).toBe('');
    });

    it('blendet im Einzel-Modus auf dem Desktop alle Fenster aus (sie laufen weiter)', async () => {
      useWorkspaceStore().uiMode = 'single';
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await flushPromises();

      await wrapper.get('.w-desktop').trigger('click');
      await flushPromises();

      expect(frameOf(wrapper, 'rechner-1').style.display).toBe('none');
      // … und über das Dock kommt genau dieses Fenster zurück.
      const before = frameOf(wrapper, 'rechner-1');
      await dockItem(wrapper, 'Rechner').trigger('click');
      await flushPromises();
      expect(frameOf(wrapper, 'rechner-1')).toBe(before);
      expect(before.style.display).toBe('');
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

    // Beide Fenster bleiben aufgebaut — zu sehen ist nur das aktive.
    expect(wrapper.findAllComponents(WindowFrame)).toHaveLength(2);
    const shown = visibleFrames(wrapper);
    expect(shown).toHaveLength(1);
    expect(shown[0].props('single')).toBe(true);
    expect(shown[0].props('win').appId).toBe('editor-2'); // das zuletzt fokussierte
  });

  it('kehrt im Einzel-Modus über den Desktop-Knopf zum Launcher zurück', async () => {
    useWorkspaceStore().uiMode = 'single';
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    await flushPromises();
    expect(visibleFrames(wrapper)).toHaveLength(1);

    await wrapper.get('.w-desktop').trigger('click');
    await flushPromises();

    // Keine App mehr im Vordergrund, der Launcher ist wieder frei.
    expect(visibleFrames(wrapper)).toHaveLength(0);
    expect(wrapper.findAll('.tile')).toHaveLength(2);
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
    expect(dockNames(wrapper)).toEqual(['Rechner']);

    await dockItem(wrapper, 'Rechner').trigger('click');
    await flushPromises();
    expect(visibleFrames(wrapper)).toHaveLength(1);
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
      await dockItem(wrapper, 'Rechner').trigger('click');
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

    it('öffnet das Startmenü mit Strg/⌘ + Leertaste', async () => {
      const { wrapper } = await mountView();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', ctrlKey: true }));
      await flushPromises();
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', metaKey: true }));
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

    it('öffnet mit Strg/⌘ + , die Einstellungen als Fenster', async () => {
      const { wrapper } = await mountView();
      await press(',', { metaKey: true });
      const desktop = useDesktopStore();
      expect(desktop.windows).toHaveLength(1);
      expect(desktop.windows[0]).toMatchObject({ kind: 'system', systemId: SETTINGS_ID });
      expect(wrapper.getComponent(SystemWindow).find('.settings-panel').exists()).toBe(true);
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
      await pressOn(wrapper.get('.dock-item.new').element, 'n', { ctrlKey: true });
      expect(useDesktopStore().windows).toHaveLength(1);
    });

    it('rührt sich nicht, während im Chat eines Fensters getippt wird', async () => {
      const { wrapper } = await mountView({ attach: true });
      // Ein Entwurfsfenster bringt seinen Chat offen mit.
      await wrapper.get('.dock-item.new').trigger('click');
      await flushPromises();
      const input = wrapper.get('.w-composer textarea').element;

      await pressOn(input, 'n', { ctrlKey: true });
      await pressOn(input, 'k', { ctrlKey: true });

      expect(useDesktopStore().windows).toHaveLength(1); // nur der Entwurf von eben
      expect(wrapper.findComponent(LauncherOverlay).exists()).toBe(false);
    });

    it('rührt sich auch nicht, während das Startmenü Eingaben entgegennimmt', async () => {
      const { wrapper } = await mountView({ attach: true });
      await wrapper.get('.search-btn').trigger('click');
      await flushPromises();

      await pressOn(wrapper.get('.lp-input').element, 'n', { ctrlKey: true });
      expect(useDesktopStore().windows).toHaveLength(0);
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

    it('bleibt still, während im Chat eines Fensters getippt wird', async () => {
      const { wrapper } = await mountView({ attach: true });
      const { ids } = await withWindows(2);
      useAppWindow(ids[1]).openComposer();
      await flushPromises();

      wrapper
        .get('.w-composer textarea')
        .element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }));
      await flushPromises();

      expect(wrapper.findComponent(SwitcherOverlay).exists()).toBe(false);
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
    /** Öffnet den Explorer über seinen festen Platz im Dock. */
    async function openExplorer(wrapper: VueWrapper) {
      await dockItem(wrapper, 'Dateien').trigger('click');
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
      // Sein Platz im Dock ist derselbe wie zuvor — er zeigt weiter den Laufpunkt.
      expect(dockNames(wrapper)).toEqual([]);
      expect(dockItem(wrapper, 'Dateien').find('.dock-dot').exists()).toBe(true);

      await dockItem(wrapper, 'Dateien').trigger('click');
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

      // Zurück auf dem Desktop — das Fenster wartet (ausgeblendet) an seinem
      // Platz im Dock.
      expect(visibleFrames(wrapper)).toHaveLength(0);
      expect(dockItem(wrapper, 'Dateien').find('.dock-dot').exists()).toBe(true);
    });

    it('nimmt keine Wünsche entgegen — er trägt keinen Chat', async () => {
      const { wrapper } = await mountView();
      await openExplorer(wrapper);

      expect(useDesktopStore().activeAppId).toBeNull();
      expect(wrapper.find('.w-chat').exists()).toBe(false);

      // Auch das Tastenkürzel öffnet vor dem Explorer keinen Chat.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', metaKey: true, shiftKey: true }));
      await flushPromises();
      expect(wrapper.find('.w-composer').exists()).toBe(false);
    });

    it('wird wie eine App in der Sitzung gemerkt', async () => {
      const { wrapper } = await mountView();
      await openExplorer(wrapper);
      expect(useWorkspaceStore().session.map((s) => s.systemId)).toEqual([EXPLORER_ID]);
    });
  });

  it('hängt den Chat im Einzel-Modus an die Vollbild-App', async () => {
    useWorkspaceStore().uiMode = 'single';
    setHost(makeHost({ loadApp: vi.fn(async () => rechnerData) }));
    const { wrapper } = await mountView();
    const desktop = useDesktopStore();
    const instanceId = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
    await flushPromises();

    await wrapper.get('.w-chat').trigger('click');

    const frame = wrapper.get('.window-frame').element as HTMLElement;
    expect(useAppWindow(instanceId).composerOpen).toBe(true);
    expect(frame.classList).toContain('full');
    expect(wrapper.get('.w-composer').find('textarea').exists()).toBe(true);

    // Auf dem Desktop selbst ist keine Eingabe zu sehen: Der Chat gehört dem
    // Fenster und verschwindet mit ihm (aufgebaut bleibt es, i0005).
    await wrapper.get('.w-desktop').trigger('click');
    await flushPromises();
    expect(visibleFrames(wrapper)).toHaveLength(0);
    expect(frame.style.display).toBe('none');
    expect(wrapper.get('.w-composer textarea').element.closest('.window-frame')).toBe(frame);
  });

  describe('Kachel-Modus', () => {
    const AREA = { x: 0, y: 0, w: 1200, h: 800 };

    /** Die Rechtecke der sichtbaren Rahmen, wie sie im Stil stehen. */
    function frameRects(wrapper: VueWrapper) {
      return visibleFrames(wrapper).map((f) => {
        const s = (f.element as HTMLElement).style;
        return {
          x: parseFloat(s.left),
          y: parseFloat(s.top),
          w: parseFloat(s.width),
          h: parseFloat(s.height),
        };
      });
    }

    function expectDisjoint(rects: { x: number; y: number; w: number; h: number }[]): void {
      for (const r of rects) {
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
      }
      for (let i = 0; i < rects.length; i += 1)
        for (let j = i + 1; j < rects.length; j += 1) {
          const [a, b] = [rects[i], rects[j]];
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
        }
    }

    /**
     * jsdom rechnet kein Layout aus — die gemessene Fläche wäre 0. Sie wird
     * darum von Hand gesetzt, nachdem die Ansicht steht (der Beobachter der
     * Ansicht meldet nur eine Änderung SEINER Messung, überschreibt also nichts).
     */
    async function tileOn() {
      useDesktopStore().setTileArea(AREA);
      useWorkspaceStore().uiMode = 'tiles';
      await flushPromises();
    }

    it('kachelt beim Umschalten die schon offenen Fenster überschneidungsfrei', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await flushPromises();

      await tileOn();

      const rects = frameRects(wrapper);
      expect(rects).toHaveLength(2);
      expectDisjoint(rects);
      // Zusammen füllen sie die Fläche (bis auf die Fuge dazwischen).
      expect(rects[0].w + rects[1].w).toBe(AREA.w - 12);
      expect(visibleFrames(wrapper).every((f) => f.props('tiled') === true)).toBe(true);
    });

    it('nimmt ein neu geöffnetes Fenster in den Verbund und reflowt beim Schließen', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      const rechner = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await tileOn();
      expect(frameRects(wrapper)).toEqual([AREA]);

      await tileWrap(wrapper, 'Editor').get('.tile').trigger('click');
      await flushPromises();
      expectDisjoint(frameRects(wrapper));
      expect(frameRects(wrapper)).toHaveLength(2);

      desktop.closeWindow(rechner);
      await flushPromises();
      // Die Schwester erbt die ganze Fläche.
      expect(frameRects(wrapper)).toEqual([AREA]);
    });

    it('nimmt ein minimiertes Fenster heraus und beim Zurückholen wieder auf', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      const editor = desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await tileOn();

      desktop.minimizeWindow(editor);
      await flushPromises();
      expect(frameRects(wrapper)).toEqual([AREA]);

      // Über das Dock kommt es zurück — und bekommt wieder eine Kachel.
      await dockItem(wrapper, 'Editor').trigger('click');
      await flushPromises();
      const rects = frameRects(wrapper);
      expect(rects).toHaveLength(2);
      expectDisjoint(rects);
    });

    it('lässt ein gekacheltes Fenster nicht mehr frei verschieben', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      await tileOn();

      await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300 }));
      await flushPromises();

      expect(frameRects(wrapper)).toEqual([AREA]);
      expect(wrapper.find('.resize-handle').exists()).toBe(false);
    });

    it('zieht an der Fuge zwischen zwei Kacheln und verschiebt die Teilung', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await tileOn();
      const vorher = frameRects(wrapper);

      // Genau eine Fuge — und sie liegt zwischen den beiden Kacheln.
      const griff = wrapper.findAll('.gap-handle');
      expect(griff).toHaveLength(1);
      await griff[0].trigger('mousedown', { button: 0 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 400 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
      await flushPromises();

      const rects = frameRects(wrapper);
      expect(rects[0].w).toBeLessThan(vorher[0].w);
      expect(rects[0].w).toBeCloseTo(400 - 6, 0);
      expectDisjoint(rects);
      expect(rects[0].w + rects[1].w).toBe(AREA.w - 12);
    });

    it('tauscht zwei Kacheln, wenn eine auf die andere getragen wird', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await tileOn();
      const [links, rechts] = frameRects(wrapper);

      const frames = visibleFrames(wrapper);
      await frames[0].get('.titlebar').trigger('mousedown', {
        clientX: links.x + links.w / 2,
        clientY: links.y + links.h / 2,
      });
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: rechts.x + rechts.w / 2,
          clientY: rechts.y + rechts.h / 2,
        }),
      );
      await flushPromises();
      // Solange getragen wird, ist keine Fuge zu fassen.
      expect(wrapper.findAll('.gap-handle')).toHaveLength(0);
      expect(frames[1].find('.drop-target').exists()).toBe(true);

      window.dispatchEvent(new MouseEvent('mouseup'));
      await flushPromises();

      expect(frameRects(wrapper)).toEqual([rechts, links]);
      expect(wrapper.find('.drop-target').exists()).toBe(false);
      expect(wrapper.findAll('.gap-handle')).toHaveLength(1);
    });

    it('rechnet die Kacheln auf eine geänderte Fläche um', async () => {
      const { wrapper } = await mountView();
      const desktop = useDesktopStore();
      desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
      desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
      await tileOn();

      desktop.setTileArea({ x: 40, y: 10, w: 600, h: 900 });
      await flushPromises();

      const rects = frameRects(wrapper);
      expectDisjoint(rects);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(40);
        expect(r.x + r.w).toBeLessThanOrEqual(640);
      }
    });
  });
});
