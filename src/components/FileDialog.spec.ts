import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import FileDialog from './FileDialog.vue';
import { setHost } from '@/services/host';
import type { DialogRequest, FsEntry, FsRequest, MorphosHost } from '@/types';

// Ein kleines Dateisystem für den Picker: Pfad → Einträge des Ordners.
const TREE: Record<string, FsEntry[]> = {
  '': [
    { name: 'notizen', path: 'notizen', isDir: true },
    { name: 'liste.txt', path: 'liste.txt', isDir: false },
    { name: 'bild.png', path: 'bild.png', isDir: false },
  ],
  notizen: [
    { name: 'heute.txt', path: 'notizen/heute.txt', isDir: false },
  ],
};

const fs = vi.fn(async (_root: string, req: FsRequest) => {
  if (req.op === 'list') {
    const entries = TREE[req.path];
    return entries ? { ok: true as const, result: entries } : { ok: false as const, error: 'Nicht gefunden' };
  }
  if (req.op === 'mkdir') {
    TREE[req.path] = [];
    return { ok: true as const };
  }
  return { ok: false as const, error: 'unerwartet' };
});

beforeEach(() => {
  fs.mockClear();
  setHost({ fs } as unknown as MorphosHost);
});

function request(over: Partial<DialogRequest> = {}): DialogRequest {
  return { kind: 'open', startDir: '', extensions: [], ...over };
}

async function open(req: DialogRequest = request()) {
  const wrapper = mount(FileDialog, { props: { request: req, root: '/data' } });
  await flushPromises();
  return wrapper;
}

/** Die Namen der angezeigten Einträge. */
function names(wrapper: Awaited<ReturnType<typeof open>>): string[] {
  return wrapper.findAll('.entry .entry-name').map((e) => e.text().trim());
}

describe('FileDialog', () => {
  it('listet den Datenordner und zeigt Ordner vor Dateien', async () => {
    const wrapper = await open();
    expect(fs).toHaveBeenCalledWith('/data', { op: 'list', path: '' });
    expect(names(wrapper)).toEqual(['notizen', 'bild.png', 'liste.txt']);
  });

  it('wechselt per Klick in einen Unterordner und wieder zurück', async () => {
    const wrapper = await open();
    await wrapper.findAll('.entry')[0].trigger('click');
    await flushPromises();
    expect(names(wrapper)).toEqual(['heute.txt']);

    await wrapper.get('.up').trigger('click');
    await flushPromises();
    expect(names(wrapper)).toContain('notizen');
  });

  it('kommt nicht über den Datenordner hinaus', async () => {
    const wrapper = await open();
    // Im Datenordner gibt es keinen Weg nach oben.
    expect(wrapper.find('.up').exists()).toBe(false);
    expect(wrapper.text()).toContain('Datenordner');
  });

  it('startet in dem von der App gewünschten Ordner', async () => {
    await open(request({ startDir: 'notizen' }));
    expect(fs).toHaveBeenCalledWith('/data', { op: 'list', path: 'notizen' });
  });

  it('blendet Dateien aus, die nicht zum Endungsfilter passen', async () => {
    const wrapper = await open(request({ extensions: ['txt'] }));
    expect(names(wrapper)).toEqual(['notizen', 'liste.txt']);
  });

  it('liefert beim Öffnen den relativen Pfad der gewählten Datei', async () => {
    const wrapper = await open();
    await wrapper.findAll('.entry')[2].trigger('click'); // liste.txt
    await wrapper.get('.confirm').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['liste.txt']]);
  });

  it('bestätigt eine Datei auch per Doppelklick', async () => {
    const wrapper = await open();
    await wrapper.findAll('.entry')[1].trigger('dblclick'); // bild.png
    expect(wrapper.emitted('pick')).toEqual([['bild.png']]);
  });

  it('öffnet erst, wenn eine Datei gewählt ist', async () => {
    const wrapper = await open();
    expect(wrapper.get('.confirm').attributes('disabled')).toBeDefined();
  });

  it('liefert null, wenn der Anwender abbricht', async () => {
    const wrapper = await open();
    await wrapper.get('.cancel').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([[null]]);
  });

  it('bricht auch mit Escape ab', async () => {
    const wrapper = await open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.emitted('pick')).toEqual([[null]]);
  });

  it('füllt beim Speichern den vorgeschlagenen Namen vor', async () => {
    const wrapper = await open(request({ kind: 'save', suggestedName: 'neu.txt' }));
    expect((wrapper.get('input.name').element as HTMLInputElement).value).toBe('neu.txt');
  });

  it('speichert in den gerade offenen Ordner', async () => {
    const wrapper = await open(request({ kind: 'save', startDir: 'notizen', suggestedName: 'neu.txt' }));
    await wrapper.get('.confirm').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['notizen/neu.txt']]);
  });

  it('ergänzt beim Speichern die erste erlaubte Endung', async () => {
    const wrapper = await open(request({ kind: 'save', extensions: ['md'] }));
    await wrapper.get('input.name').setValue('notizen');
    await wrapper.get('.confirm').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['notizen.md']]);
  });

  it('fragt vor dem Überschreiben einer vorhandenen Datei nach', async () => {
    const wrapper = await open(request({ kind: 'save', suggestedName: 'liste.txt' }));
    await wrapper.get('.confirm').trigger('click');
    // Noch nichts geliefert — erst die Rückfrage.
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect(wrapper.text()).toMatch(/überschreiben/i);

    await wrapper.get('.overwrite').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['liste.txt']]);
  });

  it('erkennt eine vorhandene Datei auch dann, wenn der Filter sie ausblendet', async () => {
    const wrapper = await open(request({ kind: 'save', extensions: ['txt'], suggestedName: 'bild.png' }));
    await wrapper.get('.confirm').trigger('click');
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect(wrapper.text()).toMatch(/überschreiben/i);
  });

  it('speichert ohne Rückfrage unter einem neuen Namen', async () => {
    const wrapper = await open(request({ kind: 'save', suggestedName: 'frisch.txt' }));
    await wrapper.get('.confirm').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['frisch.txt']]);
  });

  it('zeigt bei der Ordnerauswahl nur Ordner und liefert den offenen Ordner', async () => {
    const wrapper = await open(request({ kind: 'directory' }));
    expect(names(wrapper)).toEqual(['notizen']);
    await wrapper.get('.confirm').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['']]);
  });

  it('legt einen neuen Ordner an und wechselt hinein', async () => {
    const wrapper = await open(request({ kind: 'directory' }));
    await wrapper.get('.new-folder').trigger('click');
    await wrapper.get('input.folder-name').setValue('archiv');
    await wrapper.get('.create-folder').trigger('click');
    await flushPromises();
    expect(fs).toHaveBeenCalledWith('/data', { op: 'mkdir', path: 'archiv' });
    await wrapper.get('.confirm').trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['archiv']]);
  });

  it('zeigt beim Öffnen keinen Knopf für einen neuen Ordner', async () => {
    const wrapper = await open();
    expect(wrapper.find('.new-folder').exists()).toBe(false);
  });

  it('meldet einen Fehler des Dateisystems, statt stumm zu bleiben', async () => {
    const wrapper = await open(request({ startDir: 'gibtsnicht' }));
    expect(wrapper.text()).toContain('Nicht gefunden');
  });
});
