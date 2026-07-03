import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsDialog from './SettingsDialog.vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
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
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    ...over,
  };
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  it('zeigt die drei Bereiche Datenordner, Berechtigungen und Bibliotheken', () => {
    const wrapper = mount(SettingsDialog);
    expect(wrapper.text()).toContain('Datenordner');
    expect(wrapper.text()).toContain('Berechtigungen');
    expect(wrapper.text()).toContain('Bibliotheken');
  });

  it('setzt eine Funktions-Berechtigung', async () => {
    const wrapper = mount(SettingsDialog);
    const ws = useWorkspaceStore();
    expect(ws.permissionFor('write')).toBe('ask');
    const row = wrapper.findAll('.perms li').find((li) => li.text().includes('Datei schreiben'))!;
    const allow = row.findAll('button').find((b) => b.text() === 'Erlauben')!;
    await allow.trigger('click');
    expect(ws.permissionFor('write')).toBe('allow');
  });

  it('gibt eine Bibliotheks-Quelle frei', async () => {
    const wrapper = mount(SettingsDialog);
    const ws = useWorkspaceStore();
    await wrapper.get('.lib-add input').setValue('cdn.jsdelivr.net');
    await wrapper.get('.lib-add').trigger('submit');
    expect(ws.libWhitelist).toEqual(['cdn.jsdelivr.net']);
    await flushPromises();
    expect(wrapper.text()).toContain('cdn.jsdelivr.net');
  });

  it('legt den Datenordner fest', async () => {
    const host = makeHost({ chooseFolder: vi.fn(async () => ({ ok: true, path: '/daten' })) });
    setHost(host);
    const wrapper = mount(SettingsDialog);
    await wrapper.get('.access .btn').trigger('click');
    await flushPromises();
    expect(host.chooseFolder).toHaveBeenCalled();
    expect(useWorkspaceStore().accessRoot).toBe('/daten');
  });

  it('schließt über das Kreuz und den Hintergrund', async () => {
    const wrapper = mount(SettingsDialog);
    await wrapper.get('.close').trigger('click');
    await wrapper.get('.backdrop').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
  });
});
