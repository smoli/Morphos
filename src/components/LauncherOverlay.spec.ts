import { describe, it, expect } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import LauncherOverlay from './LauncherOverlay.vue';
import { NEW_APP_NAME } from '@/core/launcher';
import type { AppSummary } from '@/types';

const apps: AppSummary[] = [
  { id: 'rechner-1', name: 'Rechner', icon: '🧮', createdAt: 1, updatedAt: 5, versions: 3 },
  { id: 'editor-2', name: 'Text Editor', icon: '📝', createdAt: 2, updatedAt: 9, versions: 1 },
  { id: 'notiz-3', name: 'Notizzettel', icon: '🗒', createdAt: 3, updatedAt: 4, versions: 2 },
];

function mountOverlay(list: AppSummary[] = apps) {
  // attachTo, damit der Fokus im Test wirklich vergeben wird.
  return mount(LauncherOverlay, { props: { apps: list }, attachTo: document.body });
}

/** Die Namen der sichtbaren Treffer. */
function names(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.lp-item').map((i) => i.get('.lp-name').text());
}

/** Der gerade hervorgehobene Eintrag. */
function active(wrapper: VueWrapper): string {
  return wrapper.get('.lp-item.active .lp-name').text();
}

async function type(wrapper: VueWrapper, text: string): Promise<void> {
  await wrapper.get('.lp-input').setValue(text);
}

async function press(wrapper: VueWrapper, key: string): Promise<void> {
  await wrapper.get('.lp-input').trigger('keydown', { key });
}

describe('LauncherOverlay', () => {
  it('meldet eine getippte Ansicht der Schale eigens (kein App-Öffnen)', async () => {
    const wrapper = mount(LauncherOverlay, {
      props: { apps, systems: [{ id: 'explorer', name: 'Dateien', icon: '📁' }] },
      attachTo: document.body,
    });

    await type(wrapper, 'dateien');
    await press(wrapper, 'Enter');

    expect(wrapper.emitted('system')).toEqual([['explorer']]);
    expect(wrapper.emitted('open')).toBeUndefined();
    wrapper.unmount();
  });


  it('setzt den Schreibstrich beim Öffnen in das Suchfeld', () => {
    const wrapper = mountOverlay();
    expect(document.activeElement).toBe(wrapper.get('.lp-input').element);
    wrapper.unmount();
  });

  it('zeigt zunächst alle Apps und „Neue App“', () => {
    const wrapper = mountOverlay();
    expect(names(wrapper)).toEqual(['Rechner', 'Text Editor', 'Notizzettel', NEW_APP_NAME]);
    expect(active(wrapper)).toBe('Rechner');
    wrapper.unmount();
  });

  it('filtert die Liste beim Tippen', async () => {
    const wrapper = mountOverlay();
    await type(wrapper, 'not');
    expect(names(wrapper)).toEqual(['Notizzettel']);
    wrapper.unmount();
  });

  it('meldet, wenn nichts passt', async () => {
    const wrapper = mountOverlay();
    await type(wrapper, 'zzz');
    expect(names(wrapper)).toEqual([]);
    expect(wrapper.get('.lp-empty').text()).toContain('Keine App');
    wrapper.unmount();
  });

  it('wandert mit ↑/↓ durch die Treffer und läuft im Kreis', async () => {
    const wrapper = mountOverlay();
    await press(wrapper, 'ArrowDown');
    expect(active(wrapper)).toBe('Text Editor');
    await press(wrapper, 'ArrowUp');
    expect(active(wrapper)).toBe('Rechner');
    await press(wrapper, 'ArrowUp');
    expect(active(wrapper)).toBe(NEW_APP_NAME);
    wrapper.unmount();
  });

  it('beginnt nach dem Tippen wieder beim besten Treffer', async () => {
    const wrapper = mountOverlay();
    await press(wrapper, 'ArrowDown');
    await type(wrapper, 'e');
    expect(active(wrapper)).toBe('Text Editor');
    wrapper.unmount();
  });

  it('öffnet mit der Eingabetaste die hervorgehobene App', async () => {
    const wrapper = mountOverlay();
    await type(wrapper, 'text');
    await press(wrapper, 'Enter');
    expect(wrapper.emitted('open')?.[0]).toEqual(['editor-2']);
    expect(wrapper.emitted('new')).toBeUndefined();
    wrapper.unmount();
  });

  it('öffnet mit der Eingabetaste auf „Neue App“ einen Entwurf', async () => {
    const wrapper = mountOverlay();
    await type(wrapper, 'neue');
    await press(wrapper, 'Enter');
    expect(wrapper.emitted('new')).toHaveLength(1);
    expect(wrapper.emitted('open')).toBeUndefined();
    wrapper.unmount();
  });

  it('öffnet einen Eintrag auch per Klick', async () => {
    const wrapper = mountOverlay();
    await wrapper.findAll('.lp-item')[2].trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['notiz-3']);
    wrapper.unmount();
  });

  it('tut bei leerer Trefferliste nichts', async () => {
    const wrapper = mountOverlay();
    await type(wrapper, 'zzz');
    await press(wrapper, 'Enter');
    expect(wrapper.emitted('open')).toBeUndefined();
    expect(wrapper.emitted('new')).toBeUndefined();
    wrapper.unmount();
  });

  it('schließt mit Escape', async () => {
    const wrapper = mountOverlay();
    await press(wrapper, 'Escape');
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('schließt beim Klick neben das Fenster', async () => {
    const wrapper = mountOverlay();
    await wrapper.get('.lp-backdrop').trigger('mousedown');
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('bietet auch ohne Apps „Neue App“ an', () => {
    const wrapper = mountOverlay([]);
    expect(names(wrapper)).toEqual([NEW_APP_NAME]);
    wrapper.unmount();
  });
});
