import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { nextTick } from 'vue';
import PermissionDialog from './PermissionDialog.vue';
import { useWorkspaceStore } from '@/stores/workspace';

describe('PermissionDialog', () => {
  let pinia: Pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('zeigt nichts, solange keine Anfrage ansteht', () => {
    const wrapper = mount(PermissionDialog, { global: { plugins: [pinia] } });
    expect(wrapper.find('.overlay').exists()).toBe(false);
  });

  it('zeigt Operation und Pfad der anstehenden Anfrage', async () => {
    const ws = useWorkspaceStore();
    ws.pendingPermission = { op: 'delete', path: 'notizen/alt.txt' };
    const wrapper = mount(PermissionDialog, { global: { plugins: [pinia] } });
    await nextTick();
    expect(wrapper.find('.overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('löschen');
    expect(wrapper.text()).toContain('notizen/alt.txt');
  });

  it('leitet die vier Entscheidungen an den Store weiter', async () => {
    const ws = useWorkspaceStore();
    const spy = vi.spyOn(ws, 'answerPermission');
    ws.pendingPermission = { op: 'write', path: 'x' };
    const wrapper = mount(PermissionDialog, { global: { plugins: [pinia] } });
    await nextTick();

    await wrapper.get('button.allow.always').trigger('click');
    expect(spy).toHaveBeenCalledWith('allow-always');
  });
});
