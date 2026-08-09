import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ExplorerPanel from './ExplorerPanel.vue';
import { setHost } from '@/services/host';
import { formatWhen } from '@/core/explorer';
import { useShellStore } from '@/stores/shell';
import { useWorkspaceStore } from '@/stores/workspace';
import type { FsEntry, FsRequest, MorphosHost, ShellFsRequest, ShellFsResponse, TrashEntry } from '@/types';

// Ein kleiner Datenordner: Pfad → Einträge. `.trash` gehört nicht in die Liste.
let tree: Record<string, FsEntry[]>;

/** Zwei feste Zeitpunkte für Größe und Datum (c0051). */
const AUGUST = new Date(2026, 7, 9, 10, 30).getTime();
const JULI = new Date(2026, 6, 1, 8, 0).getTime();

const fs = vi.fn(async (_root: string, req: FsRequest) => {
  // Was die Vorschau der ausgewählten Datei braucht (siehe FilePreview).
  if (req.op === 'stat') {
    return {
      ok: true as const,
      result: { exists: true, isDir: false, size: 2048, modified: AUGUST, created: JULI },
    };
  }
  if (req.op === 'read') return { ok: true as const, result: 'inhalt' };
  if (req.op !== 'list') return { ok: false as const, error: 'unerwartet' };
  const entries = tree[req.path];
  return entries ? { ok: true as const, result: entries } : { ok: false as const, error: 'Nicht gefunden' };
});

/** Der Papierkorb der Attrappe und die Antwort auf den nächsten Verwaltungsauftrag. */
let trash: TrashEntry[];
let shellAnswer: ShellFsResponse;
/** Rückfrage und Eingabe beim Anwender — in der Schale `window.confirm`/`prompt`. */
let asked: ReturnType<typeof vi.fn>;
let typed: ReturnType<typeof vi.fn>;

const shellFs = vi.fn(async (_root: string, req: ShellFsRequest): Promise<ShellFsResponse> => {
  if (req.op === 'trashList') return { ok: true, result: trash };
  return shellAnswer;
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
      { name: 'liste.txt', path: 'liste.txt', isDir: false, size: 2048, modified: AUGUST, created: JULI },
      { name: 'notizen', path: 'notizen', isDir: true, size: 4096, modified: AUGUST, created: AUGUST },
      { name: '.trash', path: '.trash', isDir: true },
      // Ohne Angaben — so, wie es ein Dateisystem hin und wieder liefert.
      { name: 'bild.png', path: 'bild.png', isDir: false },
    ],
    notizen: [{ name: 'heute.txt', path: 'notizen/heute.txt', isDir: false }],
  };
  trash = [];
  shellAnswer = { ok: true };
  fs.mockClear();
  shellFs.mockClear();
  watchFolder.mockClear();
  stopWatch.mockClear();
  onChanged = null;
  setActivePinia(createPinia());
  setHost({ fs, shellFs, watchFolder } as unknown as MorphosHost);
  asked = vi.fn(() => true);
  typed = vi.fn(() => 'Neuer Name');
  vi.stubGlobal('confirm', asked);
  vi.stubGlobal('prompt', typed);
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

/** Der Kopf einer Spalte — dort wird sortiert. */
function column(wrapper: Awaited<ReturnType<typeof open>>, key: string) {
  return wrapper.get(`.ex-col[data-key="${key}"]`);
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
    await column(wrapper, 'name').trigger('click');
    expect(names(wrapper)).toEqual(['notizen', 'liste.txt', 'bild.png']);
  });

  describe('Größe und Zeitpunkte (c0051)', () => {
    it('zeigt zu jedem Eintrag Größe, Änderung und Erstellung', async () => {
      const wrapper = await open();
      const row = wrapper.findAll('.entry')[2]; // liste.txt
      expect(row.get('.entry-name').text()).toBe('liste.txt');
      expect(row.get('.entry-size').text()).toBe('2,0 KB');
      expect(row.get('.entry-modified').text()).toBe(formatWhen(AUGUST));
      expect(row.get('.entry-created').text()).toBe(formatWhen(JULI));
    });

    it('lässt Ordner ohne Größe und Unbekanntes ohne Datum', async () => {
      const wrapper = await open();
      const ordner = wrapper.findAll('.entry')[0]; // notizen
      expect(ordner.get('.entry-size').text()).toBe('—');
      // bild.png bringt gar keine Angaben mit — dann steht dort nichts Erfundenes.
      const bild = wrapper.findAll('.entry')[1];
      expect(bild.get('.entry-size').text()).toBe('—');
      expect(bild.get('.entry-created').text()).toBe('—');
    });

    it('sortiert nach einer angeklickten Spalte — Größtes und Jüngstes zuerst', async () => {
      const wrapper = await open();

      await column(wrapper, 'size').trigger('click');
      expect(names(wrapper)).toEqual(['notizen', 'liste.txt', 'bild.png']);
      // Noch einmal dieselbe Spalte dreht die Richtung um.
      await column(wrapper, 'size').trigger('click');
      expect(names(wrapper)).toEqual(['notizen', 'bild.png', 'liste.txt']);

      await column(wrapper, 'modified').trigger('click');
      expect(names(wrapper)).toEqual(['notizen', 'liste.txt', 'bild.png']);
    });

    it('nennt der Vorschau ebenfalls Größe und Zeitpunkte', async () => {
      const wrapper = await open();
      await wrapper.findAll('.entry')[2].trigger('click');
      await flushPromises();

      const head = wrapper.get('.ex-preview .pv-dates').text();
      expect(head).toContain(`geändert ${formatWhen(AUGUST)}`);
      expect(head).toContain(`erstellt ${formatWhen(JULI)}`);
    });
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

  it('zeigt die Vorschau der ausgewählten Datei — für Ordner keine', async () => {
    const wrapper = await open();
    expect(wrapper.find('.ex-preview').exists()).toBe(false);

    // ['notizen', 'bild.png', 'liste.txt'] — erst die Datei, dann der Ordner.
    await wrapper.findAll('.entry')[2].trigger('click');
    await flushPromises();
    const preview = wrapper.get('.ex-preview');
    expect(preview.text()).toContain('liste.txt');
    expect(preview.get('.pv-text').text()).toBe('inhalt');

    await wrapper.findAll('.entry')[0].trigger('click');
    await flushPromises();
    expect(wrapper.find('.ex-preview').exists()).toBe(false);
  });

  it('nimmt die Vorschau mit, wenn die Datei verschwindet', async () => {
    const wrapper = await open();
    await wrapper.findAll('.entry')[2].trigger('click');
    await flushPromises();
    expect(wrapper.find('.ex-preview').exists()).toBe(true);

    tree[''] = tree[''].filter((e) => e.name !== 'liste.txt');
    onChanged!();
    await flushPromises();
    expect(wrapper.find('.ex-preview').exists()).toBe(false);
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

// Verwalten im Datenordner (c0050) — jede Aktion geht über `shellFs`, also über
// die eingegrenzten Schalen-Operationen, nie über den App-Weg.
describe('ExplorerPanel: verwalten', () => {
  /** Wählt einen Eintrag der Liste aus (Reihenfolge: notizen, bild.png, liste.txt). */
  async function select(wrapper: Awaited<ReturnType<typeof open>>, at: number) {
    await wrapper.findAll('.entry')[at].trigger('click');
    await flushPromises();
  }

  it('legt einen Ordner im offenen Ordner an', async () => {
    const wrapper = await open();
    await wrapper.get('.ex-new').trigger('click');
    await flushPromises();

    expect(typed).toHaveBeenCalled();
    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'newFolder', path: '', to: 'Neuer Name' });
    // Danach wird neu gelesen — die Liste zeigt, was wirklich da ist.
    expect(fs).toHaveBeenLastCalledWith('/daten', { op: 'list', path: '' });
  });

  it('legt nichts an, wenn der Anwender abbricht', async () => {
    typed.mockReturnValue(null);
    const wrapper = await open();
    await wrapper.get('.ex-new').trigger('click');
    await flushPromises();
    expect(shellFs).not.toHaveBeenCalled();
  });

  it('benennt den ausgewählten Eintrag um', async () => {
    const wrapper = await open();
    expect(wrapper.get('.ex-rename').attributes('disabled')).toBeDefined();

    await select(wrapper, 2);
    await wrapper.get('.ex-rename').trigger('click');
    await flushPromises();
    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'rename', path: 'liste.txt', to: 'Neuer Name' });
  });

  it('kopiert einen Eintrag in einen anderen Ordner', async () => {
    const wrapper = await open();
    expect(wrapper.get('.ex-paste').attributes('disabled')).toBeDefined();

    await select(wrapper, 1);
    await wrapper.get('.ex-copy').trigger('click');
    expect(wrapper.get('.ex-clip').text()).toContain('bild.png');

    await wrapper.findAll('.entry')[0].trigger('dblclick');
    await flushPromises();
    await wrapper.get('.ex-paste').trigger('click');
    await flushPromises();

    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'copy', path: 'bild.png', to: 'notizen' });
    // Kopiertes bleibt gemerkt — es lässt sich mehrfach einfügen.
    expect(wrapper.get('.ex-paste').attributes('disabled')).toBeUndefined();
  });

  it('verschiebt Ausgeschnittenes und vergisst es danach', async () => {
    const wrapper = await open();
    await select(wrapper, 1);
    await wrapper.get('.ex-cut').trigger('click');
    await wrapper.get('.ex-paste').trigger('click');
    await flushPromises();

    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'move', path: 'bild.png', to: '' });
    expect(wrapper.get('.ex-paste').attributes('disabled')).toBeDefined();
  });

  it('überschreibt erst nach Rückfrage — und bei einem Nein gar nicht', async () => {
    const wrapper = await open();
    await select(wrapper, 1);
    await wrapper.get('.ex-copy').trigger('click');

    asked.mockReturnValue(false);
    shellFs.mockImplementationOnce(async () => ({ ok: false, error: '„bild.png“ gibt es dort bereits.', code: 'exists' }));
    await wrapper.get('.ex-paste').trigger('click');
    await flushPromises();
    expect(asked).toHaveBeenCalledTimes(1);
    expect(shellFs).toHaveBeenCalledTimes(1);

    asked.mockReturnValue(true);
    shellFs.mockImplementationOnce(async () => ({ ok: false, error: '„bild.png“ gibt es dort bereits.', code: 'exists' }));
    await wrapper.get('.ex-paste').trigger('click');
    await flushPromises();
    expect(shellFs).toHaveBeenLastCalledWith('/daten', {
      op: 'copy',
      path: 'bild.png',
      to: '',
      overwrite: true,
    });
  });

  it('legt den ausgewählten Eintrag nach Rückfrage in den Papierkorb', async () => {
    const wrapper = await open();
    await select(wrapper, 2);

    asked.mockReturnValue(false);
    await wrapper.get('.ex-delete').trigger('click');
    await flushPromises();
    expect(shellFs).not.toHaveBeenCalled();

    asked.mockReturnValue(true);
    await wrapper.get('.ex-delete').trigger('click');
    await flushPromises();
    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'trash', path: 'liste.txt' });
  });

  it('zeigt den Papierkorb und holt daraus zurück', async () => {
    trash = [{ id: 'weg.txt', name: 'weg.txt', from: 'notizen/weg.txt', deletedAt: 1_700_000_000_000, isDir: false }];
    const wrapper = await open();
    await wrapper.get('.ex-trash-toggle').trigger('click');
    await flushPromises();

    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'trashList', path: '' });
    const item = wrapper.get('.trash-item');
    expect(item.text()).toContain('weg.txt');
    expect(item.text()).toContain('notizen/weg.txt');

    await wrapper.get('.trash-restore').trigger('click');
    await flushPromises();
    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'restore', path: 'weg.txt' });
  });

  it('leert den Papierkorb nur nach Rückfrage', async () => {
    trash = [{ id: 'weg.txt', name: 'weg.txt', from: 'weg.txt', deletedAt: 1, isDir: false }];
    const wrapper = await open();
    await wrapper.get('.ex-trash-toggle').trigger('click');
    await flushPromises();
    shellFs.mockClear();

    asked.mockReturnValue(false);
    await wrapper.get('.ex-empty-trash').trigger('click');
    await flushPromises();
    expect(shellFs).not.toHaveBeenCalled();

    asked.mockReturnValue(true);
    await wrapper.get('.ex-empty-trash').trigger('click');
    await flushPromises();
    expect(shellFs).toHaveBeenCalledWith('/daten', { op: 'emptyTrash', path: '' });
  });

  it('meldet, woran eine Aktion gescheitert ist', async () => {
    shellAnswer = { ok: false, error: 'Der Name enthält unerlaubte Zeichen.' };
    const wrapper = await open();
    await wrapper.get('.ex-new').trigger('click');
    await flushPromises();
    expect(wrapper.get('.ex-error').text()).toContain('unerlaubte Zeichen');
  });

  it('verwaltet nicht ohne Anbindung — dann bleibt der Explorer eine Ansicht', async () => {
    setHost({ fs, watchFolder } as unknown as MorphosHost);
    const wrapper = await open();
    expect(wrapper.find('.ex-actions').exists()).toBe(false);
    expect(wrapper.find('.ex-trash-toggle').exists()).toBe(false);
  });
});
