import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AppWindow from './AppWindow.vue';
import WelcomeScreen from './WelcomeScreen.vue';
import IconDialog from './IconDialog.vue';
import DocsPanel from './DocsPanel.vue';
import AssetPanel from './AssetPanel.vue';
import DesignOverlay from './DesignOverlay.vue';
import ChatDock from './ChatDock.vue';
import AppCanvas from './AppCanvas.vue';
import { useAppWindow } from '@/stores/app';
import { useAgentsStore } from '@/stores/agents';
import { useDesktopStore } from '@/stores/desktop';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import type { AppData, GenerateResult, MorphosHost, SourceFile } from '@/types';

const DOC = (body: string, title = 'App', icon = '🧩'): string =>
  `<!DOCTYPE html><html><head><title>${title}</title><meta name="morphos:icon" content="${icon}"></head><body>${body}</body></html>`;
const FILES = (html: string): SourceFile[] => [{ path: 'src/index.html', content: html }];
/** Ein (winziges) Bild-Icon, wie es der Icon-Dialog ablegt. */
const IMAGE_ICON = `data:image/png;base64,${Buffer.alloc(60, 3).toString('base64')}`;

function appData(over: Partial<AppData> = {}): AppData {
  return {
    id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2,
    files: FILES(DOC('calc')), html: DOC('calc'), chat: [], ...over,
  };
}

function makeHost(over: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async (): Promise<GenerateResult> => ({
      ok: true,
      app: {
        id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 2,
        files: FILES(DOC('x', 'Rechner', '🧮')),
        html: DOC('x', 'Rechner', '🧮'),
        docs: { concept: '', userdoc: '' },
      },
    })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => appData()),
    saveChat: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async () => [{ sha: 'v1', prompt: 'a', time: 1 }]),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...over,
  };
}

async function mountFrameForApp(over: Partial<MorphosHost> = {}) {
  setActivePinia(createPinia());
  setHost(makeHost(over));
  const workspace = useWorkspaceStore();
  workspace.folder = '/apps';
  const desktop = useDesktopStore();
  const id = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
  const win = desktop.windows.find((w) => w.instanceId === id)!;
  const wrapper = mount(AppWindow, { props: { win } });
  await flushPromises();
  return { wrapper, desktop, workspace, win };
}

async function mountSingleFrame(over: Partial<MorphosHost> = {}) {
  setActivePinia(createPinia());
  setHost(makeHost(over));
  const workspace = useWorkspaceStore();
  workspace.folder = '/apps';
  workspace.uiMode = 'single';
  const desktop = useDesktopStore();
  const id = desktop.openApp('rechner-1', { title: 'Rechner', icon: '🧮' });
  const win = desktop.windows.find((w) => w.instanceId === id)!;
  const wrapper = mount(AppWindow, { props: { win, single: true } });
  await flushPromises();
  return { wrapper, desktop, workspace, win };
}

describe('AppWindow', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lädt die App und zeigt Name, Icon und die App im Canvas', async () => {
    const { wrapper } = await mountFrameForApp();
    expect(wrapper.get('.w-title').text()).toBe('Rechner');
    expect(wrapper.get('.w-icon').text()).toBe('🧮');
    expect(wrapper.find('iframe').exists()).toBe(true);
  });

  it('positioniert sich nach der Fenster-Geometrie', async () => {
    const { wrapper, win } = await mountFrameForApp();
    const style = wrapper.attributes('style') ?? '';
    expect(style).toContain(`${win.x}px`);
    expect(style).toContain(`${win.w}px`);
  });

  it('schließt das Fenster über den Schließen-Knopf', async () => {
    const { wrapper, desktop } = await mountFrameForApp();
    await wrapper.get('.w-close').trigger('click');
    expect(desktop.windows).toHaveLength(0);
  });

  it('minimiert das Fenster', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    await wrapper.get('.w-min').trigger('click');
    expect(desktop.windows.find((w) => w.instanceId === win.instanceId)!.minimized).toBe(true);
  });

  it('holt sich beim Anklicken den Fokus (nach vorn)', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    // Ein weiteres Fenster in den Vordergrund bringen.
    const other = desktop.openApp('editor-2', { title: 'Editor', icon: '📝' });
    expect(desktop.focusedId).toBe(other);
    await wrapper.trigger('mousedown');
    expect(desktop.focusedId).toBe(win.instanceId);
  });

  it('zeigt die Versionen über den Versionsknopf an', async () => {
    const { wrapper } = await mountFrameForApp();
    expect(wrapper.find('.w-versions-panel').exists()).toBe(false);
    await wrapper.get('.w-versions').trigger('click');
    expect(wrapper.find('.w-versions-panel').exists()).toBe(true);
    expect(wrapper.find('.w-versions-panel').text()).toContain('a');
  });

  describe('Dokumente aus der Titelleiste', () => {
    const DOCS = { concept: '# Rechner\n\nRechnet.', userdoc: '# Anleitung\n\nZahl tippen.' };

    it('öffnet Konzept und Anleitung als Nur-Lese-Ansicht', async () => {
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ docs: DOCS })),
      });
      expect(wrapper.findComponent(DocsPanel).exists()).toBe(false);

      await wrapper.get('.w-docs').trigger('click');

      const panel = wrapper.getComponent(DocsPanel);
      expect(panel.props('docs')).toEqual(DOCS);
      expect(panel.text()).toContain('Rechnet.');
      // Nur lesen — nichts zum Bearbeiten.
      expect(panel.find('textarea').exists()).toBe(false);
    });

    it('legt Dokumente und Versionen nicht übereinander', async () => {
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ docs: DOCS })),
      });
      await wrapper.get('.w-versions').trigger('click');
      await wrapper.get('.w-docs').trigger('click');

      expect(wrapper.findComponent(DocsPanel).exists()).toBe(true);
      expect(wrapper.find('.w-versions-panel').exists()).toBe(false);
    });

    it('bietet einem Entwurf (noch ohne App) keine Dokumente an', async () => {
      setActivePinia(createPinia());
      setHost(makeHost());
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();

      expect(wrapper.find('.w-docs').exists()).toBe(false);
    });
  });

  // e16/c0119: Die Beigaben der App (assets/) — hinzufügen, ansehen, entfernen.
  describe('Beigaben aus der Titelleiste', () => {
    const LOGO = { name: 'logo.png', path: 'assets/logo.png', mime: 'image/png', size: 12 };

    it('öffnet die Verwaltung mit den Beigaben der App', async () => {
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ assets: [LOGO] })),
        listAssets: vi.fn(async () => [LOGO]),
      });
      expect(wrapper.findComponent(AssetPanel).exists()).toBe(false);

      await wrapper.get('.w-assets').trigger('click');
      await flushPromises();

      const panel = wrapper.getComponent(AssetPanel);
      expect(panel.props('assets')).toEqual([LOGO]);
      expect(panel.text()).toContain('logo.png');
      // Die Warnung vor dem Entfernen liest im Quelltext der App nach.
      expect(panel.props('files')).toEqual(appData().files);
    });

    it('holt die Liste beim Aufklappen frisch von der Platte', async () => {
      const NEU = { name: 'neu.png', path: 'assets/neu.png', mime: 'image/png', size: 3 };
      const listAssets = vi.fn(async () => [NEU]);
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ assets: [LOGO] })),
        listAssets,
      });

      await wrapper.get('.w-assets').trigger('click');
      await flushPromises();

      expect(listAssets).toHaveBeenCalledWith('/apps', 'rechner-1');
      expect(wrapper.getComponent(AssetPanel).props('assets')).toEqual([NEU]);
    });

    it('legt Beigaben, Dokumente und Versionen nicht übereinander', async () => {
      const { wrapper } = await mountFrameForApp({ listAssets: vi.fn(async () => []) });

      await wrapper.get('.w-versions').trigger('click');
      await wrapper.get('.w-assets').trigger('click');
      await flushPromises();
      expect(wrapper.find('.w-versions-panel').exists()).toBe(false);

      await wrapper.get('.w-docs').trigger('click');
      expect(wrapper.findComponent(AssetPanel).exists()).toBe(false);
      expect(wrapper.findComponent(DocsPanel).exists()).toBe(true);
    });

    it('schließt die Verwaltung wieder', async () => {
      const { wrapper } = await mountFrameForApp({ listAssets: vi.fn(async () => []) });

      await wrapper.get('.w-assets').trigger('click');
      await flushPromises();
      await wrapper.getComponent(AssetPanel).get('.asset-close').trigger('click');

      expect(wrapper.findComponent(AssetPanel).exists()).toBe(false);
    });

    it('bietet einem Entwurf (noch ohne App) keine Beigaben an', async () => {
      setActivePinia(createPinia());
      setHost(makeHost());
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();

      expect(wrapper.find('.w-assets').exists()).toBe(false);
    });
  });

  // c0105: Der Entwurfs-Modus des UI-Designers — eine durchscheinende Schicht
  // ÜBER der laufenden App, aufgerufen aus der Titelleiste. Nur zum Ansehen.
  describe('Entwurfs-Modus aus der Titelleiste', () => {
    const DESIGN = {
      version: 1,
      views: [{ id: 'v1', title: 'Ansicht 1', blocks: [
        {
          id: 'b1',
          name: 'Kopf',
          rect: { x: 0, y: 0, w: 1, h: 0.2 },
          children: [{ id: 'b2', name: 'Titel', rect: { x: 0.05, y: 0.05, w: 0.4, h: 0.1 }, children: [] }],
        },
      ] }],
    };

    it('legt den Entwurf über die App und nimmt ihn wieder fort', async () => {
      const readDesign = vi.fn(async () => DESIGN);
      const { wrapper } = await mountFrameForApp({ readDesign });
      expect(wrapper.findComponent(DesignOverlay).exists()).toBe(false);

      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      expect(readDesign).toHaveBeenCalledWith('/apps', 'rechner-1');
      const overlay = wrapper.getComponent(DesignOverlay);
      expect(overlay.props('blocks')).toEqual(DESIGN.views[0].blocks);
      expect(overlay.findAll('.db-name').map((n) => n.text())).toEqual(['Kopf', 'Titel']);
      // Der geschachtelte Kasten liegt in seinem Elter.
      expect(overlay.get('.design-block .design-block .db-name').text()).toBe('Titel');

      await wrapper.get('.w-design').trigger('click');
      await flushPromises();
      expect(wrapper.findComponent(DesignOverlay).exists()).toBe(false);
    });

    it('lässt die laufende App darunter weiterlaufen', async () => {
      const { wrapper } = await mountFrameForApp({ readDesign: vi.fn(async () => DESIGN) });
      const iframe = wrapper.get('iframe').element;

      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      // Dasselbe iframe wie zuvor: Die Schicht liegt darüber, sie ersetzt nichts.
      expect(wrapper.get('iframe').element).toBe(iframe);
      expect(wrapper.findComponent(DesignOverlay).exists()).toBe(true);
    });

    it('zeigt ohne Entwurf eine leere Schicht (statt zu straucheln)', async () => {
      const { wrapper } = await mountFrameForApp({
        readDesign: vi.fn(async () => ({ version: 1, views: [] })),
      });

      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      expect(wrapper.getComponent(DesignOverlay).props('blocks')).toEqual([]);
      expect(wrapper.findAll('.design-block')).toHaveLength(0);
    });

    it('kommt auch ohne Anbindung an den Entwurf zurecht', async () => {
      const { wrapper } = await mountFrameForApp();

      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      expect(wrapper.getComponent(DesignOverlay).props('blocks')).toEqual([]);
    });

    // c0107: Was auf der Schicht gezeichnet und benannt wird, geht durch das
    // Fenster auf die Platte — hier ist die Naht zwischen beidem geprüft.
    it('gibt einen gezeichneten Kasten an den Host weiter', async () => {
      const writeDesign = vi.fn(async (_f: string, _i: string, d: unknown) => d);
      const { wrapper } = await mountFrameForApp({
        readDesign: vi.fn(async () => ({ version: 1, views: [] })),
        writeDesign: writeDesign as never,
      });
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      wrapper.getComponent(DesignOverlay).vm.$emit('draw', { x: 0, y: 0, w: 1, h: 0.2 }, 'Kopfzeile');
      await flushPromises();

      const geschrieben = writeDesign.mock.calls[0]![2] as { views: { blocks: { name: string }[] }[] };
      expect(writeDesign).toHaveBeenCalledWith('/apps', 'rechner-1', expect.anything());
      expect(geschrieben.views[0].blocks.map((b) => b.name)).toEqual(['Kopfzeile']);
      expect(wrapper.getComponent(DesignOverlay).props('blocks')).toHaveLength(1);
    });

    it('gibt einen neuen Namen an den Host weiter', async () => {
      const writeDesign = vi.fn(async (_f: string, _i: string, d: unknown) => d);
      const { wrapper } = await mountFrameForApp({
        readDesign: vi.fn(async () => DESIGN),
        writeDesign: writeDesign as never,
      });
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      wrapper.getComponent(DesignOverlay).vm.$emit('rename', 'b1', 'Kopfzeile');
      await flushPromises();

      const geschrieben = writeDesign.mock.calls[0]![2] as { views: { blocks: { name: string }[] }[] };
      expect(geschrieben.views[0].blocks[0].name).toBe('Kopfzeile');
    });

    // c0110: Auch das Löschen geht denselben Weg — die Schicht bittet, das
    // Fenster schreibt.
    it('gibt einen gelöschten Kasten an den Host weiter', async () => {
      const writeDesign = vi.fn(async (_f: string, _i: string, d: unknown) => d);
      const { wrapper } = await mountFrameForApp({
        readDesign: vi.fn(async () => DESIGN),
        writeDesign: writeDesign as never,
      });
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      wrapper.getComponent(DesignOverlay).vm.$emit('delete', 'b1');
      await flushPromises();

      // Der Kopf ist weg, sein Kind an seiner Stelle (core/design: deleteBlock).
      const geschrieben = writeDesign.mock.calls[0]![2] as { views: { blocks: { name: string }[] }[] };
      expect(geschrieben.views[0].blocks.map((b) => b.name)).toEqual(['Titel']);
      expect(wrapper.getComponent(DesignOverlay).props('blocks')).toHaveLength(1);
    });

    // c0113: Die Ansichten gehen denselben Weg — die Schicht bittet, das
    // Fenster schreibt, und was zurückkommt, steht sogleich in den Reitern.
    it('reicht die Ansichten an die Schicht durch', async () => {
      const { wrapper } = await mountFrameForApp({ readDesign: vi.fn(async () => DESIGN) });
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      const overlay = wrapper.getComponent(DesignOverlay);
      expect(overlay.props('views')).toEqual(DESIGN.views);
      expect(overlay.props('viewId')).toBe('v1');
      expect(wrapper.findAll('.dv-tab').map((t) => t.text())).toEqual(['Ansicht 1']);
    });

    it('legt eine weitere Ansicht an und wechselt zu ihr', async () => {
      const writeDesign = vi.fn(async (_f: string, _i: string, d: unknown) => d);
      const { wrapper } = await mountFrameForApp({
        readDesign: vi.fn(async () => DESIGN),
        writeDesign: writeDesign as never,
      });
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      await wrapper.get('.dv-add').trigger('click');
      await flushPromises();

      const geschrieben = writeDesign.mock.calls[0]![2] as { views: { title: string }[] };
      expect(geschrieben.views.map((v) => v.title)).toEqual(['Ansicht 1', 'Ansicht 2']);
      expect(wrapper.get('.dv-tab.on').text()).toBe('Ansicht 2');
      // Und ihr Feld steht offen — sie will benannt werden.
      expect((wrapper.get('input.dvi-title').element as HTMLInputElement).value).toBe('Ansicht 2');
    });

    it('gibt Titel, Wechsel und Löschen einer Ansicht an den Host weiter', async () => {
      const writeDesign = vi.fn(async (_f: string, _i: string, d: unknown) => d);
      const { wrapper } = await mountFrameForApp({
        readDesign: vi.fn(async () => ({
          version: 1,
          views: [
            { id: 'v1', title: 'Liste', blocks: [] },
            { id: 'v2', title: 'Detail', blocks: [] },
          ],
        })),
        writeDesign: writeDesign as never,
      });
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      // Wechseln …
      await wrapper.findAll('.dv-tab')[1].trigger('click');
      await flushPromises();
      expect(wrapper.get('.dv-tab.on').text()).toBe('Detail');

      // … benennen …
      await wrapper.get('.dv-tab.on').trigger('click');
      await wrapper.get('input.dvi-title').setValue('Einzelheiten');
      await flushPromises();
      const benannt = writeDesign.mock.calls[0]![2] as { views: { title: string }[] };
      expect(benannt.views.map((v) => v.title)).toEqual(['Liste', 'Einzelheiten']);

      // … und wegwerfen.
      await wrapper.get('.dvi-delete').trigger('click');
      await flushPromises();
      const gelöscht = writeDesign.mock.calls[1]![2] as { views: { id: string }[] };
      expect(gelöscht.views.map((v) => v.id)).toEqual(['v1']);
      expect(wrapper.get('.dv-tab.on').text()).toBe('Liste');
    });

    it('schließt ihn über den Schließen-Knopf der Schicht', async () => {
      const { wrapper } = await mountFrameForApp({ readDesign: vi.fn(async () => DESIGN) });
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      await wrapper.get('.design-close').trigger('click');

      expect(wrapper.findComponent(DesignOverlay).exists()).toBe(false);
    });

    // c0112: Auch eine App, die es noch nicht gibt, darf einen Entwurf haben —
    // er geht dann mit ihrem ersten Wunsch mit.
    it('öffnet den Entwurfs-Modus auch für einen Entwurf (noch ohne App)', async () => {
      setActivePinia(createPinia());
      const host = makeHost({ readDesign: vi.fn(async () => DESIGN) });
      setHost(host);
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();

      expect(wrapper.find('.w-design').exists()).toBe(true);
      await wrapper.get('.w-design').trigger('click');
      await flushPromises();

      const overlay = wrapper.getComponent(DesignOverlay);
      // Nichts nachzulesen — es gibt noch keinen Ordner; die Schicht sagt, wohin
      // der Entwurf stattdessen geht.
      expect(host.readDesign).not.toHaveBeenCalled();
      expect(overlay.props('blocks')).toEqual([]);
      expect(overlay.props('newApp')).toBe(true);
      expect(overlay.text()).toContain('geht mit dem ersten Wunsch mit');
    });

    // i0009: Beim Anlegen führt auch der leere Verlauf zum Entwurf — der Chat
    // eines Entwurfsfensters steht ja ohnehin offen, die Titelleiste nicht im
    // Blick.
    it('öffnet den Entwurfs-Modus auch aus dem leeren Chat eines Entwurfs', async () => {
      setActivePinia(createPinia());
      setHost(makeHost());
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();

      expect(wrapper.findComponent(DesignOverlay).exists()).toBe(false);
      await wrapper.get('.empty-design').trigger('click');
      await flushPromises();

      expect(wrapper.getComponent(DesignOverlay).props('newApp')).toBe(true);
      // Er steht offen — im Verlauf ist damit nichts mehr anzubieten.
      expect(wrapper.getComponent(ChatDock).props('designOpen')).toBe(true);
      expect(wrapper.find('.empty-design').exists()).toBe(false);
    });

    it('bietet ihn im Chat einer bestehenden App nicht an (dort steht 📐 oben)', async () => {
      const { wrapper } = await mountFrameForApp({ loadApp: vi.fn(async () => appData({ chat: [] })) });

      await wrapper.get('.w-chat').trigger('click');

      expect(wrapper.get('.empty').text()).toContain('Noch kein Dialog');
      expect(wrapper.find('.empty-design').exists()).toBe(false);
    });
  });

  it('verschiebt das Fenster per Ziehen der Titelleiste (mit Schutzschicht)', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    const startX = win.x;
    await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
    expect(wrapper.find('.drag-shield').exists()).toBe(true);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140 }));
    await wrapper.vm.$nextTick();
    const moved = desktop.windows.find((w) => w.instanceId === win.instanceId)!;
    expect(moved.x).toBe(startX + 60);
    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.drag-shield').exists()).toBe(false);
  });

  it('macht aus einem Entwurf beim ersten Generieren eine echte App (Fenster-Meta)', async () => {
    setActivePinia(createPinia());
    setHost(makeHost());
    const workspace = useWorkspaceStore();
    workspace.folder = '/apps';
    const desktop = useDesktopStore();
    const id = desktop.openDraft();
    const win = desktop.windows.find((w) => w.instanceId === id)!;
    const wrapper = mount(AppWindow, { props: { win } });
    await flushPromises();

    expect(win.appId).toBeNull();

    // Der WelcomeScreen eines leeren Entwurfs generiert über die zentrale Orchestrierung.
    wrapper.findComponent(WelcomeScreen).vm.$emit('pick', 'Ein Rechner');
    await flushPromises();

    expect(win.appId).not.toBeNull();
    expect(win.title).toBe('Rechner');
  });

  it('maximiert und stellt über den Maximieren-Knopf wieder her', async () => {
    const { wrapper, desktop, win } = await mountFrameForApp();
    await wrapper.get('.w-max').trigger('click');
    expect(desktop.find(win.instanceId)!.maximized).toBe(true);
    expect(wrapper.get('.window-frame').classes()).toContain('full');
    await wrapper.get('.w-max').trigger('click');
    expect(desktop.find(win.instanceId)!.maximized).toBe(false);
  });

  it('zeigt im Einzel-Modus keine Fensterknöpfe und keinen Ziehgriff', async () => {
    const { wrapper } = await mountSingleFrame();

    expect(wrapper.find('.w-max').exists()).toBe(false);
    expect(wrapper.find('.w-min').exists()).toBe(false);
    expect(wrapper.find('.w-close').exists()).toBe(false);
    expect(wrapper.find('.resize-handle').exists()).toBe(false);
    expect(wrapper.get('.window-frame').classes()).toContain('full');
  });

  it('kehrt im Einzel-Modus über den Desktop-Knopf zum Desktop zurück', async () => {
    const { wrapper, desktop } = await mountSingleFrame();

    const back = wrapper.get('.w-desktop');
    expect(back.text()).toContain('Desktop');
    await back.trigger('click');

    expect(desktop.showingDesktop).toBe(true);
    // Das Fenster bleibt offen — es liegt nur hinter dem Desktop.
    expect(desktop.windows).toHaveLength(1);
  });

  it('führt in der Warteanzeige den laufenden Schritt und die Laufzeit vor', async () => {
    const { wrapper, win } = await mountFrameForApp();
    expect(wrapper.find('.w-loading').exists()).toBe(false);

    const store = useAppWindow(win.instanceId);
    store.busy = true;
    store.runStartedAt = Date.now() - 65_000;
    store.activity = [{ kind: 'start' }, { kind: 'tool', name: 'Read', detail: 'src/index.html' }];
    await wrapper.vm.$nextTick();

    const loading = wrapper.get('.w-loading');
    expect(loading.text()).toContain('Die Änderung wird umgesetzt');
    expect(loading.get('.w-step').text()).toContain('Read: src/index.html');
    expect(loading.get('.w-elapsed').text()).toBe('1:05');
  });

  it('bleibt in der Warteanzeige beim allgemeinen Hinweis, solange nichts gemeldet wurde', async () => {
    const { wrapper, win } = await mountFrameForApp();

    const store = useAppWindow(win.instanceId);
    store.busy = true;
    store.runStartedAt = Date.now();
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.w-step').text()).toContain('Der Agent arbeitet');
  });

  it('zeigt den Desktop-Knopf im Fenster-Modus nicht', async () => {
    const { wrapper } = await mountFrameForApp();
    expect(wrapper.find('.w-desktop').exists()).toBe(false);
  });

  describe('Lebensdauer des Instanz-Zustands', () => {
    it('behält den Store, wenn nur die Ansicht verschwindet (das Fenster bleibt offen)', async () => {
      const { wrapper, win } = await mountSingleFrame();
      const store = useAppWindow(win.instanceId);
      store.busy = true;
      store.activity = [{ kind: 'tool', name: 'Read', detail: 'src/index.html' }];

      wrapper.unmount();

      // Dasselbe Fenster erneut anzeigen: derselbe Store, unverändert.
      const again = useAppWindow(win.instanceId);
      expect(again).toBe(store);
      expect(again.busy).toBe(true);
      expect(again.activity).toHaveLength(1);
      expect(again.id).toBe('rechner-1');
    });

    it('gibt den Store frei, sobald das Fenster wirklich geschlossen ist', async () => {
      const { wrapper, desktop, win } = await mountSingleFrame();
      const store = useAppWindow(win.instanceId);
      desktop.closeWindow(win.instanceId);

      wrapper.unmount();

      expect(useAppWindow(win.instanceId)).not.toBe(store);
    });

    it('lädt eine bereits geladene App beim erneuten Anzeigen nicht noch einmal', async () => {
      const loadApp = vi.fn(async () => appData());
      const { wrapper, win } = await mountSingleFrame({ loadApp });
      expect(loadApp).toHaveBeenCalledTimes(1);

      wrapper.unmount();
      const again = mount(AppWindow, { props: { win, single: true } });
      await flushPromises();

      expect(loadApp).toHaveBeenCalledTimes(1);
      expect(again.get('.w-title').text()).toBe('Rechner');
    });
  });

  describe('Icon aus der Titelleiste', () => {
    it('öffnet über das Icon den Dialog und setzt das gewählte Icon', async () => {
      const host = makeHost();
      const { wrapper, desktop, win } = await mountFrameForApp(host);

      await wrapper.get('.w-icon-btn').trigger('click');
      const dialog = wrapper.getComponent(IconDialog);
      expect(dialog.props('name')).toBe('Rechner');

      dialog.vm.$emit('apply', '🎯');
      await flushPromises();

      expect(host.setAppIcon).toHaveBeenCalledWith('/apps', 'rechner-1', '🎯');
      expect(wrapper.get('.w-icon').text()).toBe('🎯');
      expect(desktop.find(win.instanceId)!.icon).toBe('🎯');
      expect(wrapper.findComponent(IconDialog).exists()).toBe(false);
    });

    it('zeigt ein Bild-Icon in der Titelleiste als Bild', async () => {
      const { wrapper } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ icon: IMAGE_ICON, iconCustom: true })),
      });
      expect(wrapper.get('.w-icon img').attributes('src')).toBe(IMAGE_ICON);
    });

    it('bietet einem Entwurf (noch ohne App) keinen Icon-Dialog an', async () => {
      setActivePinia(createPinia());
      setHost(makeHost());
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();

      expect(wrapper.find('.w-icon-btn').exists()).toBe(false);
      expect(wrapper.get('.w-icon').text()).toBe('🧩');
    });
  });

  describe('Chat auf Zuruf (Composer)', () => {
    /** Ein Entwurfsfenster — sein Chat steht von Anfang an offen. */
    async function mountDraft(over: Partial<MorphosHost> = {}) {
      setActivePinia(createPinia());
      setHost(makeHost(over));
      useWorkspaceStore().folder = '/apps';
      const desktop = useDesktopStore();
      const id = desktop.openDraft();
      const win = desktop.windows.find((w) => w.instanceId === id)!;
      const wrapper = mount(AppWindow, { props: { win } });
      await flushPromises();
      return { wrapper, desktop, win, store: useAppWindow(id) };
    }

    it('zeigt bei einer geöffneten App zunächst keinen Chat, nur den Knopf dafür', async () => {
      const { wrapper } = await mountFrameForApp();
      expect(wrapper.find('.w-composer').exists()).toBe(false);
      expect(wrapper.find('.w-chat').exists()).toBe(true);
    });

    it('öffnet und schließt ihn über den 💬-Knopf der Titelleiste', async () => {
      const { wrapper, win } = await mountFrameForApp();

      await wrapper.get('.w-chat').trigger('click');
      expect(wrapper.findComponent(ChatDock).exists()).toBe(true);
      expect(useAppWindow(win.instanceId).composerOpen).toBe(true);

      await wrapper.get('.w-chat').trigger('click');
      expect(wrapper.findComponent(ChatDock).exists()).toBe(false);
    });

    it('trägt den Verlauf, die Anhänge und den Fortschritt DIESER App', async () => {
      const { wrapper, win } = await mountFrameForApp({
        loadApp: vi.fn(async () => appData({ chat: [{ role: 'user', text: 'Tasten blau', time: 1 }] })),
      });
      const store = useAppWindow(win.instanceId);
      store.busy = true;
      store.activity = [{ kind: 'tool', name: 'Read', detail: 'src/index.html' }];

      await wrapper.get('.w-chat').trigger('click');

      const dock = wrapper.getComponent(ChatDock);
      expect(dock.props('messages')).toEqual(store.chat);
      expect(dock.props('busy')).toBe(true);
      expect(dock.text()).toContain('Tasten blau');
      expect(dock.text()).toContain('Read: src/index.html');
    });

    it('schickt den Wunsch als Auftrag für dieses Fenster ab', async () => {
      const { wrapper, win } = await mountFrameForApp();
      const agents = useAgentsStore();
      const spy = vi.spyOn(agents, 'submit').mockReturnValue('job-1');

      await wrapper.get('.w-chat').trigger('click');
      await wrapper.get('textarea').setValue('Mach die Tasten blau');
      await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });

      expect(spy).toHaveBeenCalledWith(win.instanceId, 'Mach die Tasten blau', [], [], []);
    });

    it('bleibt nach dem Absenden offen (der Dialog geht weiter)', async () => {
      const { wrapper, win } = await mountFrameForApp();
      vi.spyOn(useAgentsStore(), 'submit').mockReturnValue('job-1');

      await wrapper.get('.w-chat').trigger('click');
      await wrapper.get('textarea').setValue('Mach die Tasten blau');
      await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(useAppWindow(win.instanceId).composerOpen).toBe(true);
      expect(wrapper.findComponent(ChatDock).exists()).toBe(true);
    });

    it('schließt ihn mit Escape — auch aus dem Eingabefeld heraus', async () => {
      const { wrapper, win } = await mountFrameForApp();
      await wrapper.get('.w-chat').trigger('click');

      await wrapper.get('textarea').trigger('keydown', { key: 'Escape' });

      expect(useAppWindow(win.instanceId).composerOpen).toBe(false);
      expect(wrapper.findComponent(ChatDock).exists()).toBe(false);
    });

    it('steht bei einer neuen App von Anfang an offen', async () => {
      const { wrapper } = await mountDraft();
      expect(wrapper.findComponent(ChatDock).exists()).toBe(true);
    });

    it('stellt beim Anlegen einer neuen App die Framework-Wahl — mit Preact vorgehakt', async () => {
      const { wrapper } = await mountDraft();

      const dock = wrapper.getComponent(ChatDock);
      expect(dock.props('newApp')).toBe(true);
      expect(dock.props('framework')).toBe('preact');
      expect((wrapper.get('.framework input').element as HTMLInputElement).checked).toBe(true);
    });

    it('nimmt das Abwählen in den Zustand des Fensters auf', async () => {
      const { wrapper, store } = await mountDraft();

      await wrapper.get('.framework input').setValue(false);

      expect(store.newFramework).toBe('vanilla');
    });

    it('fragt eine bestehende App nicht noch einmal nach dem Framework', async () => {
      const { wrapper } = await mountFrameForApp();
      await wrapper.get('.w-chat').trigger('click');

      expect(wrapper.getComponent(ChatDock).props('newApp')).toBe(false);
      expect(wrapper.find('.framework').exists()).toBe(false);
    });

    it('geht bei einer Rückfrage des LLM von selbst auf', async () => {
      const { wrapper, win } = await mountFrameForApp();
      expect(wrapper.findComponent(ChatDock).exists()).toBe(false);

      const store = useAppWindow(win.instanceId);
      store.pendingQuestion = 'Welche Farbe?';
      store.openComposer();
      await flushPromises();

      expect(wrapper.findComponent(ChatDock).exists()).toBe(true);
      expect(wrapper.getComponent(ChatDock).props('pendingQuestion')).toBe('Welche Farbe?');
    });

    it('zeigt bei geschlossenem Chat weiter an, dass ein Agent arbeitet', async () => {
      const { wrapper, win } = await mountFrameForApp();
      expect(wrapper.find('.w-busy').exists()).toBe(false);

      useAgentsStore().jobs = [{
        jobId: 'job-1', appKey: 'rechner-1', state: 'running', instanceId: win.instanceId,
        appId: 'rechner-1', label: 'Rechner', prompt: 'Mach was', attachments: [], elements: [], assets: [], cancelled: false,
      }];
      await flushPromises();

      expect(wrapper.find('.w-composer').exists()).toBe(false);
      expect(wrapper.find('.w-busy').exists()).toBe(true);
    });

    it('hängt ihn im Einzel-Modus genauso an das Vollbild-Fenster', async () => {
      const { wrapper } = await mountSingleFrame();

      await wrapper.get('.w-chat').trigger('click');

      expect(wrapper.get('.window-frame').classes()).toContain('full');
      expect(wrapper.get('.w-composer').findComponent(ChatDock).exists()).toBe(true);
    });
  });

  it('bewegt das Fenster im Einzel-Modus nicht per Ziehen der Titelleiste', async () => {
    const { wrapper, desktop, win } = await mountSingleFrame();
    const startX = win.x;
    await wrapper.get('.titlebar').trigger('mousedown', { clientX: 200, clientY: 100 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140 }));
    await wrapper.vm.$nextTick();
    expect(desktop.find(win.instanceId)!.x).toBe(startX);
  });
});

describe('AppWindow — Elemente markieren', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const REF = { tag: 'button', selector: 'body > button#go', text: 'Los', source: 'src/index.html:5:3' };

  /** Fenster mit offenem Chat — der 🎯-Knopf sitzt im Composer. */
  async function mountWithChat() {
    const frame = await mountFrameForApp();
    await frame.wrapper.get('.w-chat').trigger('click');
    return frame;
  }

  it('schaltet den Pick-Modus vom Composer in die App durch', async () => {
    const { wrapper } = await mountWithChat();
    expect(wrapper.getComponent(AppCanvas).props('picking')).toBeFalsy();

    await wrapper.get('.pick').trigger('click');
    expect(wrapper.getComponent(AppCanvas).props('picking')).toBe(true);
  });

  it('macht aus einem angeklickten Element ein Kärtchen — jedes nur einmal', async () => {
    const { wrapper } = await mountWithChat();
    const canvas = wrapper.getComponent(AppCanvas);
    canvas.vm.$emit('pick', REF);
    canvas.vm.$emit('pick', REF);
    canvas.vm.$emit('pick', { tag: 'h1', selector: 'body > h1', text: 'Titel' });
    await flushPromises();

    expect(wrapper.getComponent(ChatDock).props('elements')).toHaveLength(2);
    expect(wrapper.findAll('.ref-chip')).toHaveLength(2);
    expect(wrapper.get('.ref-chip').text()).toContain('Los');
  });

  it('nimmt ein Kärtchen auf Wunsch wieder weg', async () => {
    const { wrapper } = await mountWithChat();
    wrapper.getComponent(AppCanvas).vm.$emit('pick', REF);
    await flushPromises();
    await wrapper.get('.ref-chip .chip-del').trigger('click');
    expect(wrapper.findAll('.ref-chip')).toHaveLength(0);
  });

  it('beendet den Modus, wenn die App Escape meldet', async () => {
    const { wrapper } = await mountWithChat();
    await wrapper.get('.pick').trigger('click');
    wrapper.getComponent(AppCanvas).vm.$emit('exit-pick');
    await flushPromises();
    expect(wrapper.getComponent(AppCanvas).props('picking')).toBe(false);
  });

  it('schickt die markierten Elemente mit dem Wunsch und räumt sie danach weg', async () => {
    const { wrapper, win } = await mountWithChat();
    const agents = useAgentsStore();
    const spy = vi.spyOn(agents, 'submit').mockReturnValue('job-1');
    await wrapper.get('.pick').trigger('click');
    wrapper.getComponent(AppCanvas).vm.$emit('pick', REF);
    await flushPromises();

    await wrapper.get('textarea').setValue('mach das größer');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });

    expect(spy).toHaveBeenCalledWith(win.instanceId, 'mach das größer', [], [REF], []);
    await flushPromises();
    expect(wrapper.findAll('.ref-chip')).toHaveLength(0);
    expect(wrapper.getComponent(AppCanvas).props('picking')).toBe(false);
  });

  it('beendet den Modus, wenn der Chat zugeht', async () => {
    const { wrapper, win } = await mountWithChat();
    await wrapper.get('.pick').trigger('click');
    await wrapper.get('.w-chat').trigger('click');
    await flushPromises();
    expect(useAppWindow(win.instanceId).composerOpen).toBe(false);
    expect(wrapper.getComponent(AppCanvas).props('picking')).toBe(false);
  });
});
