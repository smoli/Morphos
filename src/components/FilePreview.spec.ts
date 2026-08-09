import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import FilePreview from './FilePreview.vue';
import { setHost } from '@/services/host';
import { fileUrl } from '@/core/filelink';
import { TEXT_LIMIT } from '@/core/preview';
import type { FsEntry, FsRequest, MorphosHost } from '@/types';

/** Ein kleiner Datenordner: Pfad → Inhalt (und, wo abweichend, eine Größe). */
let files: Record<string, { content?: string; size?: number }>;

const fs = vi.fn(async (_root: string, req: FsRequest) => {
  const file = files[req.path];
  if (!file) return { ok: false as const, error: 'Nicht gefunden' };
  if (req.op === 'stat') {
    const size = file.size ?? (file.content?.length ?? 0);
    return { ok: true as const, result: { exists: true, isDir: false, size, modified: 0 } };
  }
  if (req.op === 'read') return { ok: true as const, result: file.content ?? '' };
  return { ok: false as const, error: 'unerwartet' };
});

/** Merkt sich die Blobs der iframe-Dokumente, damit der Inhalt prüfbar wird. */
const blobs = new Map<string, Blob>();
let seq = 0;

beforeEach(() => {
  files = {};
  fs.mockClear();
  blobs.clear();
  seq = 0;
  setHost({ fs } as unknown as MorphosHost);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:test/${++seq}`;
      blobs.set(url, blob);
      return url;
    },
    revokeObjectURL: () => {},
  });
});

function entry(name: string): FsEntry {
  return { name, path: name, isDir: false };
}

async function open(name: string) {
  const wrapper = mount(FilePreview, { props: { root: '/daten', entry: entry(name) } });
  await flushPromises();
  return wrapper;
}

/** Der Inhalt des Dokuments im Vorschau-iframe. (jsdom-Blobs können kein text().) */
function documentOf(wrapper: { get: (s: string) => { attributes: (a: string) => string | undefined } }): Promise<string> {
  const blob = blobs.get(wrapper.get('iframe').attributes('src') ?? '');
  if (!blob) return Promise.resolve('');
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

/** Wurde die Datei gelesen (statt gestreamt)? */
function wasRead(): boolean {
  return fs.mock.calls.some((c) => (c[1] as FsRequest).op === 'read');
}

describe('FilePreview', () => {
  describe('Medien laufen über den eingegrenzten Strom', () => {
    it('zeigt ein Bild über seine Strom-Adresse, ohne es einzubetten', async () => {
      files['bild.png'] = { size: 4_000_000 };
      const wrapper = await open('bild.png');

      expect(wrapper.get('img').attributes('src')).toBe(fileUrl('/daten', 'bild.png'));
      expect(wasRead()).toBe(false);
    });

    it('zeigt Video und Ton mit Bedienelementen', async () => {
      files['film.mp4'] = { size: 99_000_000 };
      const video = await open('film.mp4');
      expect(video.get('video').attributes('src')).toBe(fileUrl('/daten', 'film.mp4'));
      expect(video.get('video').attributes('controls')).toBeDefined();

      files['ton.mp3'] = { size: 3_000_000 };
      const audio = await open('ton.mp3');
      expect(audio.get('audio').attributes('src')).toBe(fileUrl('/daten', 'ton.mp3'));
      expect(wasRead()).toBe(false);
    });

    it('sagt es, wenn ein Format nicht abgespielt werden kann', async () => {
      files['alt.mov'] = { size: 1_000 };
      const wrapper = await open('alt.mov');
      await wrapper.get('video').trigger('error');

      expect(wrapper.find('video').exists()).toBe(false);
      expect(wrapper.text()).toContain('nicht darstellen');
    });
  });

  describe('Passive Inhalte zeigt die Schale selbst', () => {
    it('rendert Markdown escape-first — aus der Datei entkommt kein Markup', async () => {
      files['notiz.md'] = { content: '# Titel\n\n<script>alert(1)</script>' };
      const wrapper = await open('notiz.md');

      expect(wrapper.get('.pv-md h1').text()).toBe('Titel');
      expect(wrapper.get('.pv-md').html()).not.toContain('<script>');
      expect(wrapper.text()).toContain('alert(1)');
    });

    it('rückt JSON ein und färbt es, ohne Markup durchzulassen', async () => {
      files['daten.json'] = { content: '{"a":"<b>x</b>","n":1}' };
      const wrapper = await open('daten.json');

      const html = wrapper.get('.pv-json').html();
      expect(html).toContain('jv-key');
      expect(html).toContain('&lt;b&gt;');
      expect(wrapper.get('.pv-json').element.querySelector('b')).toBeNull();
      // Eingerückt, nicht in einer Zeile.
      expect(wrapper.get('.pv-json').text()).toContain('\n  "a"');
    });

    it('zeigt kaputtes JSON als schlichten Text', async () => {
      files['kaputt.json'] = { content: '{ das ist keins' };
      const wrapper = await open('kaputt.json');

      expect(wrapper.find('.pv-json').exists()).toBe(false);
      expect(wrapper.get('.pv-text').text()).toContain('das ist keins');
    });

    it('zeigt Text wörtlich', async () => {
      files['liste.txt'] = { content: 'eins\nzwei' };
      const wrapper = await open('liste.txt');
      expect(wrapper.get('.pv-text').text()).toContain('eins\nzwei');
    });
  });

  describe('Aktive Dokumente kommen in die Sandbox', () => {
    it('zeigt HTML in einem iframe ohne same-origin-Rechte', async () => {
      files['seite.html'] = { content: '<html><head></head><body><script>alert(1)</script>Hallo</body></html>' };
      const wrapper = await open('seite.html');

      const iframe = wrapper.get('iframe');
      const sandbox = iframe.attributes('sandbox') ?? '';
      expect(sandbox).toContain('allow-scripts');
      expect(sandbox).not.toContain('allow-same-origin');
      expect(sandbox).not.toContain('allow-popups');
      expect(iframe.attributes('srcdoc')).toBeUndefined();

      const doc = await documentOf(wrapper);
      expect(doc).toContain('Content-Security-Policy');
      expect(doc).toContain('Hallo');
    });

    it('zeigt SVG in derselben Sandbox statt es einzusetzen', async () => {
      files['bild.svg'] = { content: '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>' };
      const wrapper = await open('bild.svg');

      expect(wrapper.get('iframe').attributes('sandbox')).not.toContain('allow-same-origin');
      expect(wrapper.element.querySelector('svg')).toBeNull();
      const doc = await documentOf(wrapper);
      expect(doc).toContain('<rect />');
      expect(doc).toContain('Content-Security-Policy');
    });
  });

  describe('Was nicht geht, sagt die Vorschau', () => {
    it('liest eine zu große Textdatei gar nicht erst', async () => {
      files['riesig.log'] = { size: TEXT_LIMIT + 1 };
      const wrapper = await open('riesig.log');

      expect(wasRead()).toBe(false);
      expect(wrapper.text()).toContain('zu groß');
    });

    it('kappt einen zu langen Inhalt mit Hinweis', async () => {
      files['lang.txt'] = { content: 'x'.repeat(TEXT_LIMIT + 5), size: 10 };
      const wrapper = await open('lang.txt');
      expect(wrapper.text()).toContain('gekürzt');
    });

    it('zeigt bei unbekannter Art nur die Angaben zur Datei', async () => {
      files['archiv.zip'] = { size: 2048 };
      const wrapper = await open('archiv.zip');

      expect(wasRead()).toBe(false);
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.find('iframe').exists()).toBe(false);
      expect(wrapper.text()).toContain('archiv.zip');
      expect(wrapper.text()).toContain('2,0 KB');
      expect(wrapper.text()).toContain('Datei');
    });

    it('meldet, wenn die Datei nicht mehr da ist', async () => {
      const wrapper = await open('weg.txt');
      expect(wrapper.text()).toContain('Nicht gefunden');
    });
  });

  it('wechselt die Vorschau mit der Auswahl', async () => {
    files['eins.txt'] = { content: 'eins' };
    files['zwei.txt'] = { content: 'zwei' };
    const wrapper = await open('eins.txt');
    expect(wrapper.text()).toContain('eins');

    await wrapper.setProps({ entry: entry('zwei.txt') });
    await flushPromises();
    expect(wrapper.get('.pv-text').text()).toBe('zwei');
  });
});
