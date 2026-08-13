import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WorkspaceFolderSection from './WorkspaceFolderSection.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import type { MorphosHost } from '@/types';

function makeHost(over: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async () => ({ ok: true as const, files: [], html: '' })),
    chooseFolder: vi.fn(async () => ({ ok: false })),
    chooseAttachment: vi.fn(async () => ({ ok: false })),
    readClipboardImage: vi.fn(async () => ({ ok: false })),
    saveChat: vi.fn(async () => ({ ok: true })),
    loadSettings: vi.fn(async () => ({ recentFolders: [], accessRoots: {} })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    listApps: vi.fn(async () => []),
    loadApp: vi.fn(async () => null),
    deleteApp: vi.fn(async () => ({ ok: true })),
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    revealFolder: vi.fn(async () => ({ ok: true })),
    openTerminal: vi.fn(async () => ({ ok: true })),
    ...over,
  };
}

describe('WorkspaceFolderSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useWorkspaceStore().folder = '/apps';
  });

  it('zeigt den Ordner, in dem die Apps dieses Desktops liegen', () => {
    setHost(makeHost());
    const wrapper = mount(WorkspaceFolderSection);
    expect(wrapper.get('.folder-path').text()).toContain('/apps');
  });

  it('öffnet den Ordner im Dateimanager des Systems', async () => {
    const host = makeHost();
    setHost(host);
    const wrapper = mount(WorkspaceFolderSection);

    await wrapper.get('.reveal').trigger('click');
    await flushPromises();

    expect(host.revealFolder).toHaveBeenCalledWith('/apps');
    expect(wrapper.find('.error').exists()).toBe(false);
  });

  it('öffnet ein Terminal in diesem Ordner', async () => {
    const host = makeHost();
    setHost(host);
    const wrapper = mount(WorkspaceFolderSection);

    await wrapper.get('.terminal').trigger('click');
    await flushPromises();

    expect(host.openTerminal).toHaveBeenCalledWith('/apps');
  });

  it('zeigt die Meldung des Hauptprozesses, wenn nichts aufgeht', async () => {
    setHost(makeHost({ openTerminal: vi.fn(async () => ({ ok: false, error: 'Kein Terminal gefunden.' })) }));
    const wrapper = mount(WorkspaceFolderSection);

    await wrapper.get('.terminal').trigger('click');
    await flushPromises();

    expect(wrapper.get('.error').text()).toContain('Kein Terminal gefunden.');
  });

  it('schaltet die Knöpfe ab, wo es die Anbindung nicht gibt', () => {
    setHost(makeHost({ revealFolder: undefined, openTerminal: undefined }));
    const wrapper = mount(WorkspaceFolderSection);

    expect(wrapper.get('.reveal').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.terminal').attributes('disabled')).toBeDefined();
  });

  it('kommt ohne geöffnetes Arbeitsverzeichnis aus', () => {
    setHost(makeHost());
    useWorkspaceStore().folder = null;
    const wrapper = mount(WorkspaceFolderSection);

    expect(wrapper.find('.folder-path').exists()).toBe(false);
    expect(wrapper.get('.reveal').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.terminal').attributes('disabled')).toBeDefined();
  });
});
