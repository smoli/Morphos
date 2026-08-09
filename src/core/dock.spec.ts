import { describe, it, expect } from 'vitest';
import { dockEntries, type DockWindow } from './dock';
import type { AppSummary } from '@/types';

const apps = [
  { id: 'rechner-1', name: 'Rechner', icon: '🧮' },
  { id: 'editor-2', name: 'Editor', icon: '📝' },
  { id: 'malen-3', name: 'Malen', icon: '🎨' },
] as unknown as AppSummary[];

/** Ein offenes Fenster, wie der Desktop es führt. */
function win(over: Partial<DockWindow> = {}): DockWindow {
  return {
    instanceId: 'win-1',
    appId: 'rechner-1',
    title: 'Rechner',
    icon: '🧮',
    minimized: false,
    ...over,
  };
}

describe('dockEntries', () => {
  it('ist leer, solange nichts behalten wird und nichts läuft', () => {
    expect(dockEntries(apps, [], [])).toEqual([]);
  });

  it('stellt die Lieblinge in ihrer Reihenfolge auf, auch ohne laufendes Fenster', () => {
    const entries = dockEntries(apps, [], ['editor-2', 'rechner-1']);
    expect(entries.map((e) => e.title)).toEqual(['Editor', 'Rechner']);
    expect(entries.map((e) => e.running)).toEqual([false, false]);
    expect(entries.map((e) => e.favorite)).toEqual([true, true]);
    expect(entries[0]).toMatchObject({ key: 'editor-2', appId: 'editor-2', icon: '📝', instanceId: null });
  });

  it('hängt die laufenden Apps hinter die Lieblinge', () => {
    const entries = dockEntries(apps, [win({ instanceId: 'win-7', appId: 'malen-3', title: 'Malen', icon: '🎨' })], [
      'editor-2',
    ]);
    expect(entries.map((e) => e.title)).toEqual(['Editor', 'Malen']);
    expect(entries[1]).toMatchObject({
      key: 'malen-3',
      instanceId: 'win-7',
      running: true,
      favorite: false,
    });
  });

  it('zeigt eine App, die läuft UND behalten wird, nur einmal — an ihrem Lieblingsplatz', () => {
    const entries = dockEntries(apps, [win({ instanceId: 'win-3' })], ['rechner-1', 'editor-2']);
    expect(entries.map((e) => e.key)).toEqual(['rechner-1', 'editor-2']);
    expect(entries[0]).toMatchObject({ instanceId: 'win-3', running: true, favorite: true });
  });

  it('merkt sich, ob das laufende Fenster minimiert wartet', () => {
    const [entry] = dockEntries(apps, [win({ minimized: true })], []);
    expect(entry).toMatchObject({ running: true, minimized: true });
  });

  it('hält die Reihenfolge der laufenden Fenster ein (zuerst geöffnet, zuerst im Dock)', () => {
    const entries = dockEntries(
      apps,
      [
        win({ instanceId: 'win-1', appId: 'malen-3', title: 'Malen', icon: '🎨' }),
        win({ instanceId: 'win-2', appId: 'editor-2', title: 'Editor', icon: '📝' }),
      ],
      [],
    );
    expect(entries.map((e) => e.key)).toEqual(['malen-3', 'editor-2']);
  });

  it('nimmt auch Fenster ohne App auf — den Entwurf und das System-Fenster', () => {
    const entries = dockEntries(
      apps,
      [
        win({ instanceId: 'win-4', appId: null, title: 'Neue App', icon: '🧩' }),
        win({ instanceId: 'win-5', appId: null, title: 'Dateien', icon: '📁' }),
      ],
      [],
    );
    // Ohne App-Id hält die Fenster-Id den Platz auseinander.
    expect(entries.map((e) => e.key)).toEqual(['win-4', 'win-5']);
    expect(entries.map((e) => e.title)).toEqual(['Neue App', 'Dateien']);
    expect(entries.every((e) => e.running && !e.favorite)).toBe(true);
  });

  it('nennt eine laufende App so, wie sie im Verzeichnis heißt (frisch umbenannt/neues Icon)', () => {
    const entries = dockEntries(apps, [win({ title: 'Alter Name', icon: '❓' })], []);
    expect(entries[0]).toMatchObject({ title: 'Rechner', icon: '🧮' });
  });

  it('nimmt Titel und Icon vom Fenster, wenn das Verzeichnis die App noch nicht kennt', () => {
    const entries = dockEntries([], [win({ title: 'Frisch erzeugt', icon: '✨' })], []);
    expect(entries[0]).toMatchObject({ title: 'Frisch erzeugt', icon: '✨' });
  });

  it('lässt gemerkte Lieblinge weg, die es nicht mehr gibt', () => {
    expect(dockEntries(apps, [], ['weg-9', 'editor-2']).map((e) => e.key)).toEqual(['editor-2']);
  });
});
