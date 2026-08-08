import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import AppCanvas from './AppCanvas.vue';
import { setHost } from '@/services/host';
import type { FsEntry, FsRequest, MorphosHost } from '@/types';

// Die erzeugte App wird als blob:-Dokument geladen. jsdom kennt
// URL.createObjectURL nicht, daher hier eine Attrappe, die zusätzlich merkt,
// welcher Blob hinter welcher URL steckt und was wieder freigegeben wurde.
const blobs = new Map<string, Blob>();
const revoked: string[] = [];
let seq = 0;

beforeEach(() => {
  blobs.clear();
  revoked.length = 0;
  seq = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:test/${++seq}`;
      blobs.set(url, blob);
      return url;
    },
    revokeObjectURL: (url: string) => { revoked.push(url); },
  });
});

afterEach(() => vi.unstubAllGlobals());

/** Der Inhalt des Dokuments, das der iframe gerade lädt. (jsdom-Blobs können kein text().) */
function documentOf(wrapper: ReturnType<typeof mount>): Promise<string> {
  const blob = blobs.get(wrapper.get('iframe').attributes('src') ?? '');
  if (!blob) return Promise.resolve('');
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('AppCanvas', () => {
  it('rendert das HTML als blob:-Dokument und injiziert die Brücke', async () => {
    const html = '<!DOCTYPE html><html><head></head><body>Hallo</body></html>';
    const wrapper = mount(AppCanvas, { props: { html } });
    const doc = await documentOf(wrapper);
    expect(doc).toContain('Hallo');
    expect(doc).toContain('data-morphos-bridge');
    expect(doc).toContain('window.morphosFS');
  });

  // Ein sandboxed srcdoc-iframe lässt Chromium bei jedem Commit
  // "Hit debug scenario: 4" auf die Konsole schreiben (i0001) — blob: nicht.
  it('lädt das Dokument über src statt über srcdoc', () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html></html>' } });
    const iframe = wrapper.get('iframe');
    expect(iframe.attributes('srcdoc')).toBeUndefined();
    expect(iframe.attributes('src')).toMatch(/^blob:/);
  });

  it('läuft in einer Sandbox ohne same-origin-Rechte', () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html></html>' } });
    const sandbox = wrapper.get('iframe').attributes('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('erlaubt keine Popups (kein Kanal nach außen)', () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html></html>' } });
    const sandbox = wrapper.get('iframe').attributes('sandbox') ?? '';
    expect(sandbox).not.toContain('allow-popups');
  });

  it('injiziert die Content-Security-Policy in das Dokument', async () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html><head></head><body></body></html>' } });
    expect(await documentOf(wrapper)).toContain('Content-Security-Policy');
  });

  it('lädt bei geändertem HTML ein neues Dokument und gibt das alte frei', async () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html><body>eins</body></html>' } });
    const first = wrapper.get('iframe').attributes('src');

    await wrapper.setProps({ html: '<html><body>zwei</body></html>' });
    await nextTick();

    const second = wrapper.get('iframe').attributes('src');
    expect(second).not.toBe(first);
    expect(await documentOf(wrapper)).toContain('zwei');
    expect(revoked).toEqual([first]);
  });

  it('gibt die Dokument-URL beim Abbau wieder frei', () => {
    const wrapper = mount(AppCanvas, { props: { html: '<html></html>' } });
    const url = wrapper.get('iframe').attributes('src');
    wrapper.unmount();
    expect(revoked).toEqual([url]);
  });
});

describe('AppCanvas — Dateidialoge über die Brücke', () => {
  const ENTRIES: FsEntry[] = [{ name: 'liste.txt', path: 'liste.txt', isDir: false }];

  const fs = vi.fn(async (_root: string, req: FsRequest) =>
    req.op === 'list' ? { ok: true as const, result: ENTRIES } : { ok: true as const },
  );
  const authorize = vi.fn(async () => true);

  /**
   * Mountet die Leinwand und liefert Werkzeug, um wie die App im iframe zu
   * senden — inklusive der Antworten, die dorthin zurückgehen.
   */
  function bridge(accessRoot: string | null = '/data') {
    // Am Dokument hängend gemountet — erst dann hat der iframe ein contentWindow,
    // das als Absender einer Nachricht dienen kann.
    const wrapper = mount(AppCanvas, {
      props: { html: '<html></html>', accessRoot, authorize },
      attachTo: document.body,
    });
    const win = wrapper.get('iframe').element.contentWindow as Window;
    const answers: Record<string, unknown>[] = [];
    vi.spyOn(win, 'postMessage').mockImplementation((msg: unknown) => {
      answers.push(msg as Record<string, unknown>);
    });
    const send = async (msg: Record<string, unknown>): Promise<void> => {
      window.dispatchEvent(new MessageEvent('message', { data: msg, source: win as MessageEventSource }));
      await flushPromises();
    };
    return { wrapper, send, answers };
  }

  beforeEach(() => {
    fs.mockClear();
    authorize.mockClear();
    setHost({ fs } as unknown as MorphosHost);
  });

  it('öffnet den Picker der Shell — außerhalb des App-iframes', async () => {
    const { wrapper, send } = bridge();
    await send({ __morphosFS: 'request', id: 'dlg1', dialog: 'open', options: {} });
    expect(wrapper.find('.dialog[role="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('liste.txt');
  });

  it('antwortet mit dem relativen Pfad — und nur auf die eigene Anfrage-Id', async () => {
    const { wrapper, send, answers } = bridge();
    await send({ __morphosFS: 'request', id: 'dlg1', dialog: 'open', options: {} });
    await wrapper.get('.entry').trigger('click');
    await wrapper.get('.confirm').trigger('click');
    await flushPromises();
    expect(answers).toEqual([{ __morphosFS: 'response', id: 'dlg1', ok: true, result: 'liste.txt' }]);
  });

  it('liefert bei Abbruch null', async () => {
    const { wrapper, send, answers } = bridge();
    await send({ __morphosFS: 'request', id: 'dlg1', dialog: 'save', options: {} });
    await wrapper.get('.cancel').trigger('click');
    await flushPromises();
    expect(answers).toEqual([{ __morphosFS: 'response', id: 'dlg1', ok: true, result: null }]);
  });

  it('fragt für den Picker selbst KEINE Berechtigung ab', async () => {
    const { wrapper, send } = bridge();
    await send({ __morphosFS: 'request', id: 'dlg1', dialog: 'open', options: {} });
    await wrapper.get('.entry').trigger('click');
    await wrapper.get('.confirm').trigger('click');
    await flushPromises();
    expect(authorize).not.toHaveBeenCalled();
    // Das anschließende Lesen läuft dagegen wie gewohnt durch das Gatter.
    await send({ __morphosFS: 'request', id: 'fs1', op: 'read', path: 'liste.txt' });
    expect(authorize).toHaveBeenCalledWith('read', 'liste.txt');
  });

  it('lehnt ohne Datenordner mit einem fangbaren Fehler ab', async () => {
    const { wrapper, send, answers } = bridge(null);
    await send({ __morphosFS: 'request', id: 'dlg1', dialog: 'open', options: {} });
    expect(wrapper.find('.dialog[role="dialog"]').exists()).toBe(false);
    expect(answers[0]).toMatchObject({ id: 'dlg1', ok: false });
    expect(String(answers[0].error)).toMatch(/Datenordner/);
  });

  it('zeigt je App nur einen Picker; ein zweiter Aufruf bekommt einen Fehler', async () => {
    const { wrapper, send, answers } = bridge();
    await send({ __morphosFS: 'request', id: 'dlg1', dialog: 'open', options: {} });
    await send({ __morphosFS: 'request', id: 'dlg2', dialog: 'open', options: {} });
    expect(wrapper.findAll('.dialog[role="dialog"]')).toHaveLength(1);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ id: 'dlg2', ok: false });
  });

  it('nimmt keine Dialoganfragen aus fremden Fenstern an', async () => {
    const { wrapper, answers } = bridge();
    window.dispatchEvent(
      new MessageEvent('message', { data: { __morphosFS: 'request', id: 'x', dialog: 'open' }, source: window }),
    );
    await flushPromises();
    expect(wrapper.find('.dialog[role="dialog"]').exists()).toBe(false);
    expect(answers).toEqual([]);
  });
});
