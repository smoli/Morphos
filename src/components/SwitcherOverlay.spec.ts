import { describe, it, expect } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import SwitcherOverlay from './SwitcherOverlay.vue';

const windows = [
  { instanceId: 'win-2', title: 'Editor', icon: '📝' },
  { instanceId: 'win-1', title: 'Rechner', icon: '🧮' },
  { instanceId: 'win-3', title: 'Neue App', icon: '🧩' },
];

function mountOverlay(index = 1) {
  return mount(SwitcherOverlay, { props: { windows, index } });
}

/** Die Namen der angebotenen Fenster, in der gezeigten Reihenfolge. */
function names(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.sw-item').map((i) => i.get('.sw-name').text());
}

describe('SwitcherOverlay', () => {
  it('zeigt die offenen Fenster in der übergebenen Reihenfolge', () => {
    const wrapper = mountOverlay();
    expect(names(wrapper)).toEqual(['Editor', 'Rechner', 'Neue App']);
    expect(wrapper.get('.sw-item').text()).toContain('📝');
  });

  it('hebt das gewählte Fenster hervor und nennt es', () => {
    const wrapper = mountOverlay(1);
    expect(wrapper.get('.sw-item.active .sw-name').text()).toBe('Rechner');
    expect(wrapper.get('.sw-title').text()).toBe('Rechner');
  });

  it('zieht die Hervorhebung mit, wenn die Auswahl weiterrückt', async () => {
    const wrapper = mountOverlay(1);
    await wrapper.setProps({ index: 2 });
    expect(wrapper.get('.sw-item.active .sw-name').text()).toBe('Neue App');
  });

  it('meldet ein angeklicktes Fenster', async () => {
    const wrapper = mountOverlay();
    await wrapper.findAll('.sw-item')[2].trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['win-3']]);
  });
});
