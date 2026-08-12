import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TelemetrySection from './TelemetrySection.vue';
import { useAgentsStore } from '@/stores/agents';
import { useWorkspaceStore } from '@/stores/workspace';
import { setHost } from '@/services/host';
import { formatBytes } from '@/core/bytes';
import type { DiskUsage, DiskUsageResult, MorphosHost } from '@/types';

const USAGE: DiskUsage = {
  apps: [
    { id: 'rechner', name: 'Rechner', icon: '🧮', bytes: 4 * 1024 * 1024 },
    { id: 'notizen', name: 'Notizen', icon: '📝', bytes: 12 * 1024 },
  ],
  appsBytes: 4 * 1024 * 1024 + 12 * 1024,
  data: { path: '/daten', bytes: 700 * 1024 },
};

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
    diskUsage: vi.fn(async () => ({ ok: true as const, usage: USAGE })),
    ...over,
  };
}

/** Legt der Warteschlange Aufträge unter, ohne einen Agenten zu starten. */
function stubQueue(): void {
  const agents = useAgentsStore();
  agents.jobs = [
    {
      jobId: 'job-1', appKey: 'rechner', state: 'running', instanceId: 'w1', appId: 'rechner',
      label: 'Rechner', prompt: 'Wurzel ziehen', attachments: [], elements: [], cancelled: false,
    },
    {
      jobId: 'job-2', appKey: 'notizen', state: 'queued', instanceId: 'w2', appId: 'notizen',
      label: 'Notizen', prompt: 'Suche einbauen', attachments: [], elements: [], cancelled: false,
    },
    {
      jobId: 'job-3', appKey: 'uhr', state: 'queued', instanceId: 'w3', appId: 'uhr',
      label: 'Uhr', prompt: 'Wecker', attachments: [], elements: [], cancelled: false,
    },
  ];
}

describe('TelemetrySection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setHost(makeHost());
    useWorkspaceStore().folder = '/apps';
  });

  it('zeigt, wie viele Agenten laufen und wie viele warten', async () => {
    stubQueue();
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    expect(wrapper.get('.stat-running .stat-value').text()).toBe('1');
    expect(wrapper.get('.stat-queued .stat-value').text()).toBe('2');
    const jobs = wrapper.findAll('.jobs li');
    expect(jobs).toHaveLength(3);
    expect(jobs[0].text()).toContain('Rechner');
    expect(jobs[0].text()).toContain('Wurzel ziehen');
  });

  it('sagt es, wenn gerade kein Agent arbeitet', async () => {
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    expect(wrapper.get('.stat-running .stat-value').text()).toBe('0');
    expect(wrapper.findAll('.jobs li')).toHaveLength(0);
    expect(wrapper.get('.jobs-empty').text()).toContain('kein Agent');
  });

  it('führt die zuletzt gelaufenen Aufträge samt Ausgang auf', async () => {
    const agents = useAgentsStore();
    agents.recent = [
      { jobId: 'job-9', label: 'Rechner', prompt: 'Wurzel ziehen', ok: true, time: 1_700_000_000_000 },
      { jobId: 'job-8', label: 'Notizen', prompt: 'Suche', ok: false, error: 'CLI nicht gefunden', time: 1_699_999_000_000 },
    ];
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    const runs = wrapper.findAll('.runs li');
    expect(runs).toHaveLength(2);
    expect(runs[0].classes()).toContain('ok');
    expect(runs[0].text()).toContain('Rechner');
    expect(runs[1].classes()).toContain('failed');
    expect(runs[1].text()).toContain('CLI nicht gefunden');
  });

  it('lässt den Platzbedarf beim Öffnen im Hauptprozess berechnen', async () => {
    const host = makeHost();
    setHost(host);
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    expect(host.diskUsage).toHaveBeenCalledWith('/apps');
    const rows = wrapper.findAll('.usage li');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Rechner');
    expect(rows[0].text()).toContain(formatBytes(USAGE.apps[0].bytes));
    expect(rows[1].text()).toContain(formatBytes(USAGE.apps[1].bytes));
    expect(wrapper.get('.total-apps').text()).toContain(formatBytes(USAGE.appsBytes));
    expect(wrapper.get('.total-data').text()).toContain(formatBytes(USAGE.data!.bytes));
    expect(wrapper.get('.total-data').text()).toContain('/daten');
  });

  it('berechnet auf Wunsch neu', async () => {
    const host = makeHost();
    setHost(host);
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    await wrapper.get('.refresh').trigger('click');
    await flushPromises();

    expect(host.diskUsage).toHaveBeenCalledTimes(2);
  });

  it('blockiert während der Berechnung nichts, sondern zeigt sie an', async () => {
    let release!: () => void;
    const host = makeHost({
      diskUsage: vi.fn(
        () => new Promise<DiskUsageResult>((resolve) => { release = () => resolve({ ok: true, usage: USAGE }); }),
      ),
    });
    setHost(host);
    stubQueue();
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    // Die Aktivität steht schon da, während der Platzbedarf noch gerechnet wird.
    expect(wrapper.find('.calculating').exists()).toBe(true);
    expect(wrapper.findAll('.jobs li')).toHaveLength(3);

    release();
    await flushPromises();

    expect(wrapper.find('.calculating').exists()).toBe(false);
    expect(wrapper.findAll('.usage li')).toHaveLength(2);
  });

  it('meldet einen Fehlschlag der Berechnung', async () => {
    setHost(makeHost({ diskUsage: vi.fn(async () => ({ ok: false as const, error: 'Ordner unbekannt' })) }));
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    expect(wrapper.get('.error').text()).toContain('Ordner unbekannt');
    expect(wrapper.findAll('.usage li')).toHaveLength(0);
  });

  it('kommt ohne Datenordner aus', async () => {
    setHost(makeHost({
      diskUsage: vi.fn(async () => ({ ok: true as const, usage: { ...USAGE, data: null } })),
    }));
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    expect(wrapper.get('.total-data').text()).toContain('Kein Datenordner');
  });

  it('fragt ohne Anbindung an den Hauptprozess gar nicht erst', async () => {
    setHost(makeHost({ diskUsage: undefined }));
    const wrapper = mount(TelemetrySection);
    await flushPromises();

    expect(wrapper.findAll('.usage li')).toHaveLength(0);
    expect(wrapper.get('.error').text()).toContain('nicht verfügbar');
  });
});
