import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ExplorerPanel from './ExplorerPanel.vue';
import { setHost } from '@/services/host';
import { useShellStore } from '@/stores/shell';
import { useWorkspaceStore } from '@/stores/workspace';
import type { FsEntry, FsRequest, MorphosHost } from '@/types';

// Ein kleiner Datenordner: Pfad → Einträge. `.trash` gehört nicht in die Liste.
let tree: Record<string, FsEntry[]>;

const fs = vi.fn(async (_root: string, req: FsRequest) => {
  if (req.op !== 'list') return { ok: false as const, error: 'unerwartet' };
  const entries = tree[req.path];
  return entries ? { ok: true as const, result: entries } : { ok: false as const, error: 'Nicht gefunden' };
});

/** Die zuletzt angemeldete Rückmeldung des Ordner-Beobachters. */
let onChanged: (() => void) | null;
const stopWatch = vi.fn();
const watchFolder = vi.fn(async (_root: string, _path: string, cb: () => void) => {
  onChanged = cb;
  return stopWatch;
});

beforeEach(() => {
  tree = {
    '': [
      { name: 'liste.txt', path: 'liste.txt', isDir: false },
      { name: 'notizen', path: 'notizen', isDir: true },
      { name: '.trash', path: '.trash', isDir: true },
      { name: 'bild.png', path: 'bild.png', isDir: false },
    ],
    notizen: [{ name: 'heute.txt', path: 'notizen/heute.txt', isDir: false }],
  };
  fs.mockClear();
  watchFolder.mockClear();
  stopWatch.mockClear();
  onChanged = null;
  setActivePinia(createPinia());
  setHost({ fs, watchFolder } as unknown as MorphosHost);
});

/** Öffnet den Explorer — mit Datenordner, sofern nicht anders gewünscht. */
async function open(root: string | null = '/daten') {
  const workspace = useWorkspaceStore();
  workspace.folder = '/apps';
  if (root) workspace.accessRoots = { '/apps': root };
  const wrapper = mount(ExplorerPanel);
  await flushPromises();
  return wrapper;
}

function names(wrapper: Awaited<ReturnType<typeof open>>): string[] {
  return wrapper.findAll('.entry .entry-name').map((e) => e.text().trim());
}

describe('ExplorerPanel', () => {
  it('listet den Datenordner: Ordner vor Dateien, Verborgenes bleibt draußen', async () => {
    const wrapper = await open();

    expect(fs).toHaveBeenCalledWith('/daten', { op: 'list', path: '' });
    expect(names(wrapper)).toEqual(['notizen', 'bild.png', 'liste.txt']);
    expect(wrapper.text()).not.toContain('.trash');
  });

  it('wechselt in einen Unterordner und über die Wegmarken zurück', async () => {
    const wrapper = await open();
    // Im Datenordner selbst führt kein Weg nach oben.
    expect(wrapper.find('.ex-up').exists()).toBe(false);

    await wrapper.findAll('.entry')[0].trigger('dblclick');
    await flushPromises();
    expect(names(wrapper)).toEqual(['heute.txt']);
    expect(wrapper.get('.ex-crumbs').text()).toContain('notizen');

    await wrapper.get('.ex-up').trigger('click');
    await flushPromises();
    expect(names(wrapper)).toContain('notizen');
    expect(wrapper.find('.ex-up').exists()).toBe(false);
  });

  it('sortiert auf Wunsch andersherum', async () => {
    const wrapper = await open();
    await wrapper.get('.ex-sort').trigger('click');
    expect(names(wrapper)).toEqual(['notizen', 'liste.txt', 'bild.png']);
  });

  it('bittet um einen Datenordner, wenn keiner festgelegt ist', async () => {
    const wrapper = await open(null);

    expect(fs).not.toHaveBeenCalled();
    expect(watchFolder).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Datenordner');

    await wrapper.get('.ex-choose').trigger('click');
    expect(useShellStore().settingsOpen).toBe(true);
  });

  it('meldet den Ordner beim Hauptprozess zur Beobachtung an', async () => {
    await open();
    expect(watchFolder).toHaveBeenCalledTimes(1);
    expect(watchFolder.mock.calls[0][0]).toBe('/daten');
    expect(watchFolder.mock.calls[0][1]).toBe('');
  });

  it('liest neu, sobald sich im Ordner etwas ändert', async () => {
    const wrapper = await open();
    fs.mockClear();

    tree[''] = [...tree[''], { name: 'neu.txt', path: 'neu.txt', isDir: false }];
    onChanged!();
    await flushPromises();

    expect(fs).toHaveBeenCalledWith('/daten', { op: 'list', path: '' });
    expect(names(wrapper)).toContain('neu.txt');
  });

  it('beobachtet nach einem Ordnerwechsel den neuen Ordner statt des alten', async () => {
    const wrapper = await open();
    await wrapper.findAll('.entry')[0].trigger('dblclick');
    await flushPromises();

    expect(stopWatch).toHaveBeenCalledTimes(1);
    expect(watchFolder).toHaveBeenCalledTimes(2);
    expect(watchFolder.mock.calls[1][1]).toBe('notizen');
  });

  it('beendet die Beobachtung, wenn das Fenster geschlossen wird', async () => {
    const wrapper = await open();
    expect(stopWatch).not.toHaveBeenCalled();

    wrapper.unmount();
    await flushPromises();
    expect(stopWatch).toHaveBeenCalledTimes(1);
  });

  it('zeigt einen leeren Ordner als solchen und meldet Fehler', async () => {
    tree[''] = [];
    const leer = await open();
    expect(leer.get('.ex-empty').text()).toContain('leer');

    delete tree[''];
    onChanged!();
    await flushPromises();
    expect(leer.get('.ex-error').text()).toContain('Nicht gefunden');
  });
});
