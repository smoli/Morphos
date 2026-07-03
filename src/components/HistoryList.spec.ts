import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HistoryList from './HistoryList.vue';
import type { VersionInfo } from '@/types';

// Git-Historie: neueste zuerst.
const versions: VersionInfo[] = [
  { sha: 'b', prompt: 'zweite Idee', time: 2 },
  { sha: 'a', prompt: 'erste Idee', time: 1 },
];

describe('HistoryList', () => {
  it('zeigt einen Eintrag pro Version', () => {
    const wrapper = mount(HistoryList, { props: { versions, activeSha: 'b' } });
    expect(wrapper.findAll('li')).toHaveLength(2);
    expect(wrapper.text()).toContain('erste Idee');
    expect(wrapper.text()).toContain('zweite Idee');
  });

  it('markiert die aktive Version', () => {
    const wrapper = mount(HistoryList, { props: { versions, activeSha: 'a' } });
    const active = wrapper.findAll('li').filter((li) => li.classes('active'));
    expect(active).toHaveLength(1);
    expect(active[0].text()).toContain('erste Idee');
  });

  it('emittiert select mit dem Commit der geklickten Version', async () => {
    const wrapper = mount(HistoryList, { props: { versions, activeSha: 'b' } });
    const first = wrapper.findAll('li').find((li) => li.text().includes('erste Idee'))!;
    await first.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['a']);
  });

  it('zeigt die neueste Version zuerst (Reihenfolge der Historie)', () => {
    const wrapper = mount(HistoryList, { props: { versions, activeSha: 'b' } });
    expect(wrapper.findAll('li')[0].text()).toContain('zweite Idee');
  });

  it('zeigt einen Hinweis, wenn es noch keine Versionen gibt', () => {
    const wrapper = mount(HistoryList, { props: { versions: [], activeSha: null } });
    expect(wrapper.findAll('li')).toHaveLength(0);
    expect(wrapper.text().toLowerCase()).toContain('noch keine');
  });
});
