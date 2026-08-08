import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import AgentsIndicator from './AgentsIndicator.vue';
import { useAgentsStore } from '@/stores/agents';
import type { AgentJob } from '@/stores/agents';

const job = (over: Partial<AgentJob> = {}): AgentJob => ({
  jobId: 'job-1',
  appKey: 'rechner-1',
  state: 'running',
  instanceId: 'win-1',
  appId: 'rechner-1',
  label: 'Rechner',
  prompt: 'Mach eine Wurzeltaste',
  attachments: [],
  cancelled: false,
  ...over,
});

describe('AgentsIndicator', () => {
  let pinia: Pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountIt = () => mount(AgentsIndicator, { global: { plugins: [pinia] } });

  it('zeigt die Zahl der laufenden und wartenden Läufe', async () => {
    const agents = useAgentsStore();
    const wrapper = mountIt();
    expect(wrapper.get('.agents-count').text()).toBe('0');

    agents.jobs = [job(), job({ jobId: 'job-2', appKey: 'editor-2', state: 'queued' })];
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.agents-count').text()).toBe('2');
    expect(wrapper.get('.agents-btn').classes()).toContain('busy');
    expect(wrapper.get('.agents-btn').attributes('title')).toBe('Agenten: 1 laufend, 1 wartend');
  });

  it('klappt eine Liste der Läufe mit App-Namen und Wunsch auf', async () => {
    const agents = useAgentsStore();
    agents.jobs = [job(), job({ jobId: 'job-2', appKey: 'editor-2', label: 'Editor', state: 'queued', prompt: 'Dunkles Thema' })];
    const wrapper = mountIt();

    expect(wrapper.find('.agents-popover').exists()).toBe(false);
    await wrapper.get('.agents-btn').trigger('click');

    const rows = wrapper.findAll('.agents-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Rechner');
    expect(rows[0].text()).toContain('Mach eine Wurzeltaste');
    expect(rows[1].text()).toContain('Editor');
    expect(rows[0].get('.agents-state').classes()).toContain('running');
    expect(rows[1].get('.agents-state').classes()).toContain('queued');
  });

  it('bricht einen Lauf aus der Liste heraus ab', async () => {
    const agents = useAgentsStore();
    agents.jobs = [job(), job({ jobId: 'job-2', appKey: 'editor-2', state: 'queued' })];
    const wrapper = mountIt();
    await wrapper.get('.agents-btn').trigger('click');

    await wrapper.findAll('.agents-row')[1].get('.agents-cancel').trigger('click');

    expect(agents.jobs.map((j) => j.jobId)).toEqual(['job-1']);
  });

  it('sagt es, wenn kein Agent arbeitet', async () => {
    const wrapper = mountIt();
    await wrapper.get('.agents-btn').trigger('click');
    expect(wrapper.get('.agents-popover').text()).toContain('Zurzeit arbeitet kein Agent.');
  });

  it('schließt die Liste, sobald der letzte Lauf fertig ist', async () => {
    const agents = useAgentsStore();
    agents.jobs = [job()];
    const wrapper = mountIt();
    await wrapper.get('.agents-btn').trigger('click');
    expect(wrapper.find('.agents-popover').exists()).toBe(true);

    agents.jobs = [];
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.agents-popover').exists()).toBe(false);
  });
});
