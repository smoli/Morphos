import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, markRaw } from 'vue';
import SettingsPanel from './SettingsPanel.vue';
import { SETTINGS_SECTIONS } from './sections';
import { SHORTCUTS, SWITCHER_KEYS } from '@/core/shortcuts';
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
    setAppIcon: vi.fn(async (_f: string, _i: string, icon: string | null) => ({ ok: true, icon: icon ?? '🧩' })),
    listVersions: vi.fn(async () => []),
    revertApp: vi.fn(async () => ({ ok: true })),
    fs: vi.fn(async () => ({ ok: true as const, result: null })),
    diskUsage: vi.fn(async () => ({
      ok: true as const,
      usage: {
        apps: [{ id: 'rechner', name: 'Rechner', icon: '🧮', bytes: 2 * 1024 * 1024 }],
        appsBytes: 2 * 1024 * 1024,
        data: { path: '/daten', bytes: 1024 },
      },
    })),
    ...over,
  };
}

/** Wechselt über die Seitenleiste in die Kategorie mit diesem Namen. */
async function openCategory(wrapper: VueWrapper, label: string): Promise<void> {
  const cat = wrapper.findAll('.cat').find((b) => b.text().includes(label));
  expect(cat, `Kategorie „${label}“ fehlt in der Seitenleiste`).toBeTruthy();
  await cat!.trigger('click');
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  it('zeigt für jede registrierte Kategorie einen Eintrag in der Seitenleiste', () => {
    const wrapper = mount(SettingsPanel);
    const cats = wrapper.findAll('.cat');
    expect(cats).toHaveLength(SETTINGS_SECTIONS.length);
    for (const section of SETTINGS_SECTIONS) {
      expect(cats.some((c) => c.text().includes(section.label))).toBe(true);
    }
  });

  it('zeigt anfangs die erste Kategorie und nur deren Inhalt', () => {
    const wrapper = mount(SettingsPanel);
    const cats = wrapper.findAll('.cat');
    expect(cats[0].classes()).toContain('active');
    expect(cats[0].attributes('aria-selected')).toBe('true');
    expect(wrapper.get('.pane').text()).toContain('gleichzeitige Läufe');
    // Die übrigen Bereiche sind nicht gerendert.
    expect(wrapper.text()).not.toContain('Datenordner der Apps');
    expect(wrapper.text()).not.toContain('Datei schreiben');
    expect(wrapper.text()).not.toContain('freigegebene Quellen');
  });

  it('wechselt die Kategorie und tauscht dabei den Inhalt aus', async () => {
    const wrapper = mount(SettingsPanel);
    await openCategory(wrapper, 'Berechtigungen');

    expect(wrapper.get('.pane').text()).toContain('Datei schreiben');
    expect(wrapper.text()).not.toContain('gleichzeitige Läufe');
    const active = wrapper.findAll('.cat').filter((c) => c.classes().includes('active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('Berechtigungen');
  });

  it('nimmt neue Kategorien allein durch Registrierung auf', async () => {
    const Extra = markRaw(
      defineComponent({
        name: 'ExtraSection',
        render: () => h('p', { class: 'extra' }, 'Inhalt des Beispielbereichs'),
      }),
    );
    const wrapper = mount(SettingsPanel, {
      props: { sections: [...SETTINGS_SECTIONS, { id: 'beispiel', label: 'Beispiel', icon: '🧪', component: Extra }] },
    });

    expect(wrapper.findAll('.cat')).toHaveLength(SETTINGS_SECTIONS.length + 1);
    await openCategory(wrapper, 'Beispiel');
    expect(wrapper.get('.pane .extra').text()).toBe('Inhalt des Beispielbereichs');
  });

  it('stellt den Deckel gleichzeitiger Agenten ein (Vorgabe zwei)', async () => {
    const wrapper = mount(SettingsPanel);
    const ws = useWorkspaceStore();
    await openCategory(wrapper, 'Agenten');

    const buttons = wrapper.findAll('.agents-setting .seg button');
    expect(buttons).toHaveLength(8);
    expect(buttons.find((b) => b.classes().includes('active'))!.text()).toBe('2');

    await buttons[3].trigger('click'); // „4“
    expect(ws.maxAgents).toBe(4);
    expect(wrapper.findAll('.agents-setting .seg button').find((b) => b.classes().includes('active'))!.text()).toBe('4');
  });

  it('setzt eine Funktions-Berechtigung', async () => {
    const wrapper = mount(SettingsPanel);
    const ws = useWorkspaceStore();
    await openCategory(wrapper, 'Berechtigungen');

    expect(ws.permissionFor('write')).toBe('ask');
    const row = wrapper.findAll('.perms li').find((li) => li.text().includes('Datei schreiben'))!;
    const allow = row.findAll('button').find((b) => b.text() === 'Erlauben')!;
    await allow.trigger('click');
    expect(ws.permissionFor('write')).toBe('allow');
  });

  it('gibt eine Bibliotheks-Quelle frei und entzieht sie wieder', async () => {
    const wrapper = mount(SettingsPanel);
    const ws = useWorkspaceStore();
    await openCategory(wrapper, 'Bibliotheken');

    await wrapper.get('.lib-add input').setValue('cdn.jsdelivr.net');
    await wrapper.get('.lib-add').trigger('submit');
    expect(ws.libWhitelist).toEqual(['cdn.jsdelivr.net']);
    await flushPromises();
    expect(wrapper.text()).toContain('cdn.jsdelivr.net');

    await wrapper.get('.lib-del').trigger('click');
    expect(ws.libWhitelist).toEqual([]);
  });

  it('legt den Datenordner fest', async () => {
    const host = makeHost({ chooseFolder: vi.fn(async () => ({ ok: true, path: '/daten' })) });
    setHost(host);
    const wrapper = mount(SettingsPanel);
    await openCategory(wrapper, 'Datenordner');

    await wrapper.get('.access .btn').trigger('click');
    await flushPromises();
    expect(host.chooseFolder).toHaveBeenCalled();
    expect(useWorkspaceStore().accessRoot).toBe('/daten');
  });

  it('führt die Tastenkürzel des Desktops auf', async () => {
    const wrapper = mount(SettingsPanel);
    await openCategory(wrapper, 'Tastenkürzel');

    const rows = wrapper.findAll('.keys li');
    // Jedes Kürzel aus core/shortcuts plus der Fensterwechsler.
    expect(rows).toHaveLength(SHORTCUTS.length + 1);
    for (const s of SHORTCUTS) {
      expect(rows.some((li) => li.text().includes(s.label) && li.get('kbd').text() === s.keys)).toBe(true);
    }
    expect(wrapper.get('.pane').text()).toContain(SWITCHER_KEYS);
  });

  it('zeigt Agenten-Aktivität und Platzbedarf in der Telemetrie', async () => {
    const host = makeHost();
    setHost(host);
    const wrapper = mount(SettingsPanel);
    await openCategory(wrapper, 'Telemetrie');
    await flushPromises();

    expect(wrapper.get('.pane .stat-running .stat-value').text()).toBe('0');
    // Gerechnet wird im Hauptprozess — die Oberfläche fragt nur nach.
    expect(host.diskUsage).toHaveBeenCalledWith('/apps');
    expect(wrapper.get('.pane .usage li').text()).toContain('2,0 MB');
    expect(wrapper.get('.pane .total-data').text()).toContain('/daten');
  });

  it('trägt keinen eigenen Rahmen — Titel und Schließen gehören dem Fenster', () => {
    const wrapper = mount(SettingsPanel);
    expect(wrapper.find('.backdrop').exists()).toBe(false);
    expect(wrapper.find('.close').exists()).toBe(false);
  });
});
