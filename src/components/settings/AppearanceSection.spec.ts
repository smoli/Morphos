import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AppearanceSection from './AppearanceSection.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import {
  DEFAULT_DOCK_BLUR,
  DEFAULT_DOCK_TRANSPARENCY,
  dockBackgroundCss,
  dockBlurCss,
} from '@/core/transparency';
import { DEFAULT_DOCK_AUTOHIDE } from '@/core/dock';
import type { MorphosHost } from '@/types';

function makeHost(over: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '' })),
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

describe('AppearanceSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  /** Der Regler für die Durchsichtigkeit des Docks. */
  function slider(wrapper: ReturnType<typeof mount>) {
    return wrapper.get('input[type="range"].level');
  }

  it('steht anfangs auf der Vorgabe und nennt sie in Prozent', () => {
    const wrapper = mount(AppearanceSection);
    expect((slider(wrapper).element as HTMLInputElement).value).toBe(String(DEFAULT_DOCK_TRANSPARENCY));
    expect(wrapper.get('.value').text()).toBe('50 %');
  });

  it('merkt einen geschobenen Wert im Workspace', async () => {
    const wrapper = mount(AppearanceSection);
    const ws = useWorkspaceStore();

    await slider(wrapper).setValue('0.6');

    expect(ws.dockTransparency).toBe(0.6);
    expect(ws.hasDockTransparency).toBe(true);
    expect(wrapper.get('.value').text()).toBe('60 %');
  });

  it('zeigt die Leiste in der Vorschau so durchsichtig, wie sie wird', async () => {
    const wrapper = mount(AppearanceSection);
    expect(wrapper.get('.dock-preview').attributes('style')).toContain(
      dockBackgroundCss(DEFAULT_DOCK_TRANSPARENCY),
    );

    await slider(wrapper).setValue('0.9');

    expect(wrapper.get('.dock-preview').attributes('style')).toContain(dockBackgroundCss(0.9));
  });

  it('setzt auf die Vorgabe zurück — und bietet das erst an, wenn es etwas zurückzusetzen gibt', async () => {
    const wrapper = mount(AppearanceSection);
    const ws = useWorkspaceStore();
    expect(wrapper.get('.reset').attributes('disabled')).toBeDefined();

    await slider(wrapper).setValue('0.6');
    expect(wrapper.get('.reset').attributes('disabled')).toBeUndefined();

    await wrapper.get('.reset').trigger('click');

    expect(ws.dockTransparency).toBe(DEFAULT_DOCK_TRANSPARENCY);
    expect(ws.hasDockTransparency).toBe(false);
    expect((slider(wrapper).element as HTMLInputElement).value).toBe(String(DEFAULT_DOCK_TRANSPARENCY));
  });

  it('rührt ohne geöffnetes Verzeichnis nichts an', async () => {
    const ws = useWorkspaceStore();
    ws.folder = null;
    const wrapper = mount(AppearanceSection);

    await slider(wrapper).setValue('0.6');

    expect(ws.dockTransparencies).toEqual({});
  });

  /** Der Regler für den Milchglas-Schleier des Docks. */
  function blurSlider(wrapper: ReturnType<typeof mount>) {
    return wrapper.get('input[type="range"].blur-level');
  }

  it('steht anfangs auf der Vorgabe und nennt sie in Bildpunkten', () => {
    const wrapper = mount(AppearanceSection);
    expect((blurSlider(wrapper).element as HTMLInputElement).value).toBe(String(DEFAULT_DOCK_BLUR));
    expect(wrapper.get('.blur-value').text()).toBe('14 px');
  });

  it('merkt einen geschobenen Schleier im Workspace', async () => {
    const wrapper = mount(AppearanceSection);
    const ws = useWorkspaceStore();

    await blurSlider(wrapper).setValue('22');

    expect(ws.dockBlur).toBe(22);
    expect(ws.hasDockBlur).toBe(true);
    expect(wrapper.get('.blur-value').text()).toBe('22 px');
  });

  it('zeigt die Leiste in der Vorschau so matt, wie sie wird', async () => {
    const wrapper = mount(AppearanceSection);
    expect(wrapper.get('.dock-preview').attributes('style')).toContain(dockBlurCss(DEFAULT_DOCK_BLUR));

    await blurSlider(wrapper).setValue('0');

    expect(wrapper.get('.dock-preview').attributes('style')).toContain(dockBlurCss(0));
  });

  it('setzt den Schleier auf die Vorgabe zurück — und bietet das erst an, wenn es etwas zurückzusetzen gibt', async () => {
    const wrapper = mount(AppearanceSection);
    const ws = useWorkspaceStore();
    expect(wrapper.get('.blur-reset').attributes('disabled')).toBeDefined();

    await blurSlider(wrapper).setValue('22');
    expect(wrapper.get('.blur-reset').attributes('disabled')).toBeUndefined();

    await wrapper.get('.blur-reset').trigger('click');

    expect(ws.dockBlur).toBe(DEFAULT_DOCK_BLUR);
    expect(ws.hasDockBlur).toBe(false);
    expect((blurSlider(wrapper).element as HTMLInputElement).value).toBe(String(DEFAULT_DOCK_BLUR));
  });

  it('rührt den Schleier ohne geöffnetes Verzeichnis nicht an', async () => {
    const ws = useWorkspaceStore();
    ws.folder = null;
    const wrapper = mount(AppearanceSection);

    await blurSlider(wrapper).setValue('22');

    expect(ws.dockBlurs).toEqual({});
  });

  /** Der Schalter fürs Ausblenden des Docks. */
  function autohide(wrapper: ReturnType<typeof mount>) {
    return wrapper.get('input[type="checkbox"].autohide');
  }

  it('steht anfangs auf der Vorgabe: Das Dock blendet sich nicht aus', () => {
    const wrapper = mount(AppearanceSection);
    expect((autohide(wrapper).element as HTMLInputElement).checked).toBe(DEFAULT_DOCK_AUTOHIDE);
  });

  it('merkt das Ausblenden im Workspace — und nimmt es auch wieder zurück', async () => {
    const wrapper = mount(AppearanceSection);
    const ws = useWorkspaceStore();

    await autohide(wrapper).setValue(true);
    expect(ws.dockAutohide).toBe(true);

    await autohide(wrapper).setValue(false);
    expect(ws.dockAutohide).toBe(false);
    // Die Vorgabe wird nicht gemerkt — das Verzeichnis steht dann nicht mehr drin.
    expect(ws.dockAutohides).toEqual({});
  });

  it('zeigt in der Vorschau, was der Schalter tut', async () => {
    const wrapper = mount(AppearanceSection);
    expect(wrapper.get('.dock-preview').classes()).not.toContain('away');

    await autohide(wrapper).setValue(true);

    expect(wrapper.get('.dock-preview').classes()).toContain('away');
  });

  it('rührt das Ausblenden ohne geöffnetes Verzeichnis nicht an', async () => {
    const ws = useWorkspaceStore();
    ws.folder = null;
    const wrapper = mount(AppearanceSection);

    await autohide(wrapper).setValue(true);

    expect(ws.dockAutohides).toEqual({});
  });
});
