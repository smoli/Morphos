import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import AppCanvas from './AppCanvas.vue';

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
