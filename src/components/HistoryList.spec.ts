import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HistoryList from './HistoryList.vue';
import type { HistoryEntry } from '@/types';

const entries: HistoryEntry[] = [
  { id: 'a', prompt: 'erste Idee', html: '<html>1</html>', time: 1 },
  { id: 'b', prompt: 'zweite Idee', html: '<html>2</html>', time: 2 },
];

describe('HistoryList', () => {
  it('zeigt einen Eintrag pro Version', () => {
    const wrapper = mount(HistoryList, { props: { entries, activeId: 'b' } });
    expect(wrapper.findAll('li')).toHaveLength(2);
    expect(wrapper.text()).toContain('erste Idee');
    expect(wrapper.text()).toContain('zweite Idee');
  });

  it('markiert die aktive Version', () => {
    const wrapper = mount(HistoryList, { props: { entries, activeId: 'a' } });
    const active = wrapper.findAll('li').filter((li) => li.classes('active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('erste Idee');
  });

  it('emittiert select mit der id des geklickten Eintrags', async () => {
    const wrapper = mount(HistoryList, { props: { entries, activeId: 'b' } });
    const first = wrapper.findAll('li').find((li) => li.text().includes('erste Idee'))!;
    await first.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['a']);
  });

  it('zeigt die neueste Version zuerst', () => {
    const wrapper = mount(HistoryList, { props: { entries, activeId: 'b' } });
    expect(wrapper.findAll('li')[0].text()).toContain('zweite Idee');
  });

  it('zeigt einen Hinweis, wenn es noch keine Versionen gibt', () => {
    const wrapper = mount(HistoryList, { props: { entries: [], activeId: null } });
    expect(wrapper.findAll('li')).toHaveLength(0);
    expect(wrapper.text().toLowerCase()).toContain('noch keine');
  });
});
