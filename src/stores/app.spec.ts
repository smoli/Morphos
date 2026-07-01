import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from './app';
import { setHost } from '@/services/host';
import type { MorphosHost, GenerateResult } from '@/types';

function makeHost(overrides: Partial<MorphosHost> = {}): MorphosHost {
  return {
    generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, html: '<!DOCTYPE html><html></html>' })),
    loadState: vi.fn(async () => ({ history: [], activeId: null })),
    saveState: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hat einen leeren Ausgangszustand', () => {
    const store = useAppStore();
    expect(store.history).toEqual([]);
    expect(store.currentHtml).toBe('');
    expect(store.activeId).toBeNull();
    expect(store.busy).toBe(false);
    expect(store.error).toBeNull();
    expect(store.hasApp).toBe(false);
    expect(store.historyCount).toBe(0);
  });

  it('erzeugt eine App, legt sie in der Historie ab und speichert', async () => {
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: true, html: '<!DOCTYPE html><html><body>calc</body></html>' })),
    });
    setHost(host);
    const store = useAppStore();

    await store.generate('Ein Taschenrechner');

    expect(host.generate).toHaveBeenCalledWith('Ein Taschenrechner', '');
    expect(store.history).toHaveLength(1);
    expect(store.currentHtml).toContain('calc');
    expect(store.activeId).toBe(store.history[0].id);
    expect(store.hasApp).toBe(true);
    expect(store.busy).toBe(false);
    expect(host.saveState).toHaveBeenCalledOnce();
  });

  it('sendet den aktuellen Stand zur Weiterentwicklung mit', async () => {
    let call = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => {
        call += 1;
        return { ok: true, html: `<!DOCTYPE html><html><body>v${call}</body></html>` };
      }),
    });
    setHost(host);
    const store = useAppStore();

    await store.generate('erste Version');
    await store.generate('zweite Version');

    expect(host.generate).toHaveBeenNthCalledWith(2, 'zweite Version', expect.stringContaining('v1'));
    expect(store.history).toHaveLength(2);
    expect(store.currentHtml).toContain('v2');
  });

  it('verweigert leere Eingaben und ruft den Host nicht auf', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();

    await store.generate('   ');

    expect(host.generate).not.toHaveBeenCalled();
    expect(store.error).toBeTruthy();
    expect(store.history).toHaveLength(0);
  });

  it('setzt einen Fehler, wenn der Host einen Fehler meldet', async () => {
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => ({ ok: false, error: 'CLI nicht gefunden' })),
    });
    setHost(host);
    const store = useAppStore();

    await store.generate('irgendwas');

    expect(store.error).toBe('CLI nicht gefunden');
    expect(store.history).toHaveLength(0);
    expect(store.busy).toBe(false);
  });

  it('fängt geworfene Ausnahmen des Hosts ab', async () => {
    const host = makeHost({
      generate: vi.fn(async () => { throw new Error('Boom'); }),
    });
    setHost(host);
    const store = useAppStore();

    await store.generate('irgendwas');

    expect(store.error).toContain('Boom');
    expect(store.busy).toBe(false);
  });

  it('springt über revertTo zu einer früheren Version zurück', async () => {
    let n = 0;
    const host = makeHost({
      generate: vi.fn(async (): Promise<GenerateResult> => { n += 1; return { ok: true, html: `<html><body>v${n}</body></html>` }; }),
    });
    setHost(host);
    const store = useAppStore();

    await store.generate('a');
    const firstId = store.history[0].id;
    await store.generate('b');
    expect(store.currentHtml).toContain('v2');

    store.revertTo(firstId);
    expect(store.currentHtml).toContain('v1');
    expect(store.activeId).toBe(firstId);
  });

  it('ignoriert revertTo mit unbekannter id', async () => {
    const host = makeHost();
    setHost(host);
    const store = useAppStore();
    await store.generate('a');
    const before = store.currentHtml;

    store.revertTo('gibt-es-nicht');
    expect(store.currentHtml).toBe(before);
  });

  it('lädt einen gespeicherten Zustand vom Host', async () => {
    const persisted = {
      history: [{ id: 'x1', prompt: 'a', html: '<html>A</html>', time: 1 }],
      activeId: 'x1',
    };
    const host = makeHost({ loadState: vi.fn(async () => persisted) });
    setHost(host);
    const store = useAppStore();

    await store.loadFromHost();

    expect(store.history).toHaveLength(1);
    expect(store.activeId).toBe('x1');
    expect(store.currentHtml).toBe('<html>A</html>');
  });

  it('leert den Fehler über clearError', () => {
    const store = useAppStore();
    store.error = 'x';
    store.clearError();
    expect(store.error).toBeNull();
  });
});
