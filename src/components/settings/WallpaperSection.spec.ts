import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WallpaperSection from './WallpaperSection.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import { DEFAULT_WALLPAPER, wallpaperCss, WALLPAPER_PRESETS } from '@/core/wallpaper';
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
    saveChat: vi.fn(async () => ({ ok: true })),
    deleteApp: vi.fn(async () => ({ ok: true })),
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...over,
  };
}

describe('WallpaperSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  it('zeigt zu jeder Vorlage eine Schaltfläche mit ihrem Hintergrund', () => {
    const wrapper = mount(WallpaperSection);
    const presets = wrapper.findAll('.preset');
    expect(presets).toHaveLength(WALLPAPER_PRESETS.length);
    expect(presets[1].attributes('style')).toContain('background');
    expect(presets[1].attributes('aria-label')).toBe(WALLPAPER_PRESETS[1].label);
  });

  it('markiert die gerade gültige Vorlage (anfangs die Vorgabe)', async () => {
    const wrapper = mount(WallpaperSection);
    expect(wrapper.findAll('.preset')[0].classes()).toContain('active');

    await wrapper.findAll('.preset')[1].trigger('click');

    expect(wrapper.findAll('.preset')[0].classes()).not.toContain('active');
    expect(wrapper.findAll('.preset')[1].classes()).toContain('active');
  });

  it('übernimmt eine gewählte Vorlage in den Workspace', async () => {
    const wrapper = mount(WallpaperSection);
    const ws = useWorkspaceStore();

    await wrapper.findAll('.preset')[3].trigger('click');

    expect(ws.wallpaper).toEqual(WALLPAPER_PRESETS[3].wallpaper);
    expect(ws.hasWallpaper).toBe(true);
  });

  it('übernimmt eine eigene Farbe', async () => {
    const wrapper = mount(WallpaperSection);
    const ws = useWorkspaceStore();

    await wrapper.find('input[type="color"]').setValue('#123456');
    await wrapper.findAll('.btn').find((b) => b.text() === 'Übernehmen')!.trigger('click');

    expect(ws.wallpaper).toEqual({ kind: 'color', color: '#123456' });
  });

  it('setzt auf die Vorgabe zurück (und bietet das nur mit eigenem Hintergrund an)', async () => {
    const wrapper = mount(WallpaperSection);
    const ws = useWorkspaceStore();
    const resetBtn = () => wrapper.findAll('.btn').find((b) => b.text().includes('zurücksetzen'))!;
    expect(resetBtn().attributes('disabled')).toBeDefined();

    await wrapper.findAll('.preset')[2].trigger('click');
    expect(resetBtn().attributes('disabled')).toBeUndefined();
    await resetBtn().trigger('click');

    expect(ws.hasWallpaper).toBe(false);
    expect(ws.wallpaper).toEqual(DEFAULT_WALLPAPER);
  });

  it('zeigt die Vorschau des gültigen Hintergrunds', async () => {
    const wrapper = mount(WallpaperSection);
    expect(wrapper.find('.preview').attributes('style')).toContain(wallpaperCss(DEFAULT_WALLPAPER));
    expect(wrapper.find('.preview-label').text()).toBe('Vorgabe');

    await wrapper.findAll('.preset')[1].trigger('click');

    expect(wrapper.find('.preview-label').text()).toBe('Eigener Hintergrund');
  });

  it('meldet einen nicht unterstützten Dateityp, statt ihn abzulegen', async () => {
    const wrapper = mount(WallpaperSection);
    const input = wrapper.find('input[type="file"]');
    const file = new File(['x'], 'schaden.exe', { type: 'application/octet-stream' });
    Object.defineProperty(input.element, 'files', { value: [file] });

    await input.trigger('change');

    expect(wrapper.find('.error').text()).toContain('nicht unterstützt');
    expect(useWorkspaceStore().hasWallpaper).toBe(false);
  });
});
