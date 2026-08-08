import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useElapsed } from './useElapsed';

/** Winziges Wirtskomponenten-Gerüst: zeigt die Laufzeit als Text. */
function mountElapsed(startedAt: ReturnType<typeof ref<number | null>>) {
  const Host = defineComponent({
    setup() {
      const elapsed = useElapsed(() => startedAt.value);
      return () => h('span', elapsed.value);
    },
  });
  return mount(Host);
}

describe('useElapsed', () => {
  afterEach(() => vi.useRealTimers());

  it('bleibt leer, solange kein Lauf begonnen hat', () => {
    vi.useFakeTimers();
    const wrapper = mountElapsed(ref<number | null>(null));
    expect(wrapper.text()).toBe('');
  });

  it('zählt im Sekundentakt weiter, solange der Lauf läuft', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const startedAt = ref<number | null>(10_000);
    const wrapper = mountElapsed(startedAt);
    expect(wrapper.text()).toBe('0:00');

    await vi.advanceTimersByTimeAsync(65_000);
    expect(wrapper.text()).toBe('1:05');
  });

  it('hält an und leert sich, sobald der Lauf vorbei ist', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const startedAt = ref<number | null>(10_000);
    const wrapper = mountElapsed(startedAt);

    startedAt.value = null;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('räumt den Taktgeber beim Abbau der Komponente ab', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const wrapper = mountElapsed(ref<number | null>(10_000));
    expect(vi.getTimerCount()).toBe(1);

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
