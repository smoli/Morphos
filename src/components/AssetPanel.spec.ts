import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AssetPanel from './AssetPanel.vue';
import type { AssetInfo } from '@/core/assets';
import type { AssetContent, AssetResult, SaveResult, SourceFile } from '@/types';

const LOGO: AssetInfo = { name: 'logo.png', path: 'assets/logo.png', mime: 'image/png', size: 2048 };
const DATEN: AssetInfo = { name: 'daten.json', path: 'assets/daten.json', mime: 'application/json', size: 14 };
const SCHRIFT: AssetInfo = { name: 'schrift.woff2', path: 'assets/schrift.woff2', mime: 'font/woff2', size: 4096 };

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

const FILES: SourceFile[] = [{ path: 'src/index.html', content: '<img src="assets/logo.png">' }];

function mountPanel(over: {
  assets?: AssetInfo[];
  files?: SourceFile[];
  read?: (path: string) => Promise<AssetContent | null>;
  add?: (name: string, data: string) => Promise<AssetResult>;
  remove?: (path: string) => Promise<SaveResult>;
} = {}) {
  const read = over.read ?? vi.fn(async () => null);
  const add = over.add ?? vi.fn(async (name: string): Promise<AssetResult> => ({
    ok: true, asset: { name, path: `assets/${name}`, mime: 'image/png', size: 3 },
  }));
  const remove = over.remove ?? vi.fn(async (): Promise<SaveResult> => ({ ok: true }));
  const wrapper = mount(AssetPanel, {
    props: { assets: over.assets ?? [LOGO, DATEN], files: over.files ?? FILES, read, add, remove },
  });
  return { wrapper, read, add, remove };
}

/** Eine gewählte oder gezogene Datei, wie sie im Browser ankommt. */
const file = (name: string, body: string, type: string): File => new File([body], name, { type });

/**
 * Ausstehende Zusagen abarbeiten. Mehrfach, denn der FileReader antwortet erst
 * im nächsten Durchlauf — und die Dateien werden nacheinander gelesen.
 */
async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await flushPromises();
}

/** Was der Dateiwähler nach dem Klick liefert. */
async function pick(wrapper: ReturnType<typeof mountPanel>['wrapper'], files: File[]): Promise<void> {
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: files, configurable: true });
  await input.trigger('change');
  await settle();
}

describe('AssetPanel — die Liste', () => {
  it('führt jede Beigabe mit Namen, Typ und Größe auf', () => {
    const { wrapper } = mountPanel();
    const rows = wrapper.findAll('.asset-item');
    expect(rows).toHaveLength(2);
    expect(rows[0].get('.asset-name').text()).toBe('logo.png');
    expect(rows[0].get('.asset-type').text()).toBe('Bild · PNG');
    expect(rows[0].get('.asset-size').text()).toBe('2,0 KB');
    expect(rows[1].get('.asset-name').text()).toBe('daten.json');
    expect(rows[1].get('.asset-type').text()).toBe('Daten · JSON');
  });

  it('sagt es, solange die App keine Beigaben hat', () => {
    const { wrapper } = mountPanel({ assets: [] });
    expect(wrapper.find('.asset-item').exists()).toBe(false);
    expect(wrapper.get('.asset-empty').text()).toMatch(/noch keine/i);
  });

  it('lässt sich schließen', async () => {
    const { wrapper } = mountPanel();
    await wrapper.get('.asset-close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});

describe('AssetPanel — hinzufügen', () => {
  it('legt die gewählte Datei mit ihren Bytes ab', async () => {
    const { wrapper, add } = mountPanel();

    await pick(wrapper, [file('neu.png', 'ROH', 'image/png')]);

    expect(add).toHaveBeenCalledWith('neu.png', b64('ROH'));
  });

  it('legt mehrere gewählte Dateien nacheinander ab — jede ist ein eigener Commit', async () => {
    const add = vi.fn(async (name: string): Promise<AssetResult> => ({
      ok: true, asset: { name, path: `assets/${name}`, mime: 'image/png', size: 1 },
    }));
    const { wrapper } = mountPanel({ add });

    await pick(wrapper, [file('a.png', 'A', 'image/png'), file('b.png', 'B', 'image/png')]);

    expect(add.mock.calls.map((c) => c[0])).toEqual(['a.png', 'b.png']);
  });

  it('nimmt fallengelassene Dateien genauso auf', async () => {
    const { wrapper, add } = mountPanel();

    await wrapper.get('.asset-panel').trigger('drop', {
      dataTransfer: { files: [file('gezogen.png', 'Z', 'image/png')] },
    });
    await settle();

    expect(add).toHaveBeenCalledWith('gezogen.png', b64('Z'));
  });

  it('zeigt beim Ziehen an, dass hier abgelegt werden kann — und wieder nicht', async () => {
    const { wrapper } = mountPanel();
    const panel = wrapper.get('.asset-panel');

    await panel.trigger('dragenter', { dataTransfer: { types: ['Files'] } });
    expect(wrapper.find('.asset-drop').exists()).toBe(true);

    await panel.trigger('dragleave');
    expect(wrapper.find('.asset-drop').exists()).toBe(false);
  });

  it('lässt einen Zug ohne Dateien unbeachtet (kein leeres Ablegen)', async () => {
    const { wrapper, add } = mountPanel();

    await wrapper.get('.asset-panel').trigger('drop', { dataTransfer: { files: [] } });
    await settle();

    expect(add).not.toHaveBeenCalled();
    expect(wrapper.find('.asset-error').exists()).toBe(false);
  });

  it('schreibt hin, woran das Ablegen scheiterte — und macht mit den übrigen weiter', async () => {
    const add = vi.fn(async (name: string): Promise<AssetResult> => (
      name === 'a.png'
        ? { ok: false, error: 'Unbrauchbarer Asset-Name' }
        : { ok: true, asset: { name, path: `assets/${name}`, mime: 'image/png', size: 1 } }
    ));
    const { wrapper } = mountPanel({ add });

    await pick(wrapper, [file('a.png', 'A', 'image/png'), file('b.png', 'B', 'image/png')]);

    expect(add.mock.calls.map((c) => c[0])).toEqual(['a.png', 'b.png']);
    expect(wrapper.get('.asset-error').text()).toContain('Unbrauchbarer Asset-Name');
    expect(wrapper.get('.asset-error').text()).toContain('a.png');
  });
});

describe('AssetPanel — Vorschau', () => {
  it('zeigt ein gewähltes Bild', async () => {
    const read = vi.fn(async (): Promise<AssetContent> => ({ ...LOGO, data: 'AAEC' }));
    const { wrapper } = mountPanel({ read });

    await wrapper.findAll('.asset-item')[0].trigger('click');
    await flushPromises();

    expect(read).toHaveBeenCalledWith('assets/logo.png');
    expect(wrapper.get('.pv-image').attributes('src')).toBe('data:image/png;base64,AAEC');
  });

  it('zeigt eine Datendatei als Text', async () => {
    const read = vi.fn(async (): Promise<AssetContent> => ({ ...DATEN, data: b64('{ "a": 1 }') }));
    const { wrapper } = mountPanel({ read });

    await wrapper.findAll('.asset-item')[1].trigger('click');
    await flushPromises();

    expect(wrapper.get('.pv-text').text()).toBe('{ "a": 1 }');
  });

  it('zeigt zu einer Schrift die Angaben zur Datei — kein Text, kein Bild', async () => {
    const read = vi.fn(async (): Promise<AssetContent> => ({ ...SCHRIFT, data: 'AAEC' }));
    const { wrapper } = mountPanel({ assets: [SCHRIFT], read });

    await wrapper.get('.asset-item').trigger('click');
    await flushPromises();

    const info = wrapper.get('.pv-file');
    expect(info.text()).toContain('schrift.woff2');
    expect(info.text()).toContain('Schrift · WOFF2');
    expect(info.text()).toContain('4,0 KB');
    expect(wrapper.find('.pv-text').exists()).toBe(false);
    expect(wrapper.find('.pv-image').exists()).toBe(false);
  });

  it('sagt es, wenn sich die Datei nicht lesen lässt (etwa weil sie gerade entfernt wurde)', async () => {
    const { wrapper } = mountPanel({ read: vi.fn(async () => null) });

    await wrapper.findAll('.asset-item')[0].trigger('click');
    await flushPromises();

    expect(wrapper.get('.pv-missing').text()).toMatch(/nicht lesen/i);
  });

  it('zeigt nie den Inhalt zur falschen Datei, wenn ein Lesen überholt wird', async () => {
    const answers: Record<string, AssetContent> = {
      'assets/logo.png': { ...LOGO, data: 'AAEC' },
      'assets/daten.json': { ...DATEN, data: b64('{ "a": 1 }') },
    };
    let hold: () => void = () => {};
    const read = vi.fn(async (path: string): Promise<AssetContent> => {
      // Das erste Lesen bleibt hängen, bis das zweite durch ist.
      if (path === 'assets/logo.png') await new Promise<void>((res) => { hold = res; });
      return answers[path];
    });
    const { wrapper } = mountPanel({ read });

    await wrapper.findAll('.asset-item')[0].trigger('click');
    await wrapper.findAll('.asset-item')[1].trigger('click');
    await flushPromises();
    hold();
    await flushPromises();

    expect(wrapper.get('.pv-text').text()).toBe('{ "a": 1 }');
    expect(wrapper.find('.pv-image').exists()).toBe(false);
  });
});

describe('AssetPanel — entfernen', () => {
  it('fragt nach, bevor etwas verschwindet', async () => {
    const { wrapper, remove } = mountPanel();

    await wrapper.findAll('.asset-item')[0].get('.asset-remove').trigger('click');

    expect(remove).not.toHaveBeenCalled();
    expect(wrapper.get('.asset-confirm').text()).toContain('logo.png');
  });

  it('warnt, wenn der Code die Beigabe noch verwendet — und entfernt sie trotzdem, wenn der Anwender es will', async () => {
    const { wrapper, remove } = mountPanel();

    await wrapper.findAll('.asset-item')[0].get('.asset-remove').trigger('click');
    expect(wrapper.get('.asset-used').text()).toContain('src/index.html');

    await wrapper.get('.asset-confirm-ok').trigger('click');
    await flushPromises();

    expect(remove).toHaveBeenCalledWith('assets/logo.png');
    expect(wrapper.find('.asset-confirm').exists()).toBe(false);
  });

  it('warnt nicht, wo niemand sie verwendet', async () => {
    const { wrapper } = mountPanel();

    await wrapper.findAll('.asset-item')[1].get('.asset-remove').trigger('click');

    expect(wrapper.find('.asset-used').exists()).toBe(false);
  });

  it('nimmt das Nachfragen zurück, ohne etwas zu entfernen', async () => {
    const { wrapper, remove } = mountPanel();

    await wrapper.findAll('.asset-item')[0].get('.asset-remove').trigger('click');
    await wrapper.get('.asset-confirm-cancel').trigger('click');

    expect(remove).not.toHaveBeenCalled();
    expect(wrapper.find('.asset-confirm').exists()).toBe(false);
  });

  it('schreibt hin, woran das Entfernen scheiterte', async () => {
    const { wrapper } = mountPanel({ remove: vi.fn(async () => ({ ok: false, error: 'Datei gesperrt' })) });

    await wrapper.findAll('.asset-item')[0].get('.asset-remove').trigger('click');
    await wrapper.get('.asset-confirm-ok').trigger('click');
    await flushPromises();

    expect(wrapper.get('.asset-error').text()).toContain('Datei gesperrt');
  });

  it('räumt die Vorschau mit weg, wenn die gezeigte Beigabe entfernt ist', async () => {
    const read = vi.fn(async (): Promise<AssetContent> => ({ ...LOGO, data: 'AAEC' }));
    const { wrapper } = mountPanel({ read });

    await wrapper.findAll('.asset-item')[0].trigger('click');
    await flushPromises();
    expect(wrapper.find('.pv-image').exists()).toBe(true);

    // Das Entfernen führt der Aufrufer aus; hier kommt nur die neue Liste an.
    await wrapper.setProps({ assets: [DATEN] });

    expect(wrapper.find('.pv-image').exists()).toBe(false);
    expect(wrapper.find('.asset-preview-empty').exists()).toBe(true);
  });
});
