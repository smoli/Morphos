import { describe, it, expect } from 'vitest';
import {
  cleanAutohide,
  cleanAutohides,
  cleanDockEdge,
  cleanDockEdges,
  DEFAULT_DOCK_AUTOHIDE,
  DEFAULT_DOCK_EDGE,
  DOCK_EDGES,
  dockEntries,
  dockRevealed,
  type DockSystem,
  type DockWindow,
} from './dock';
import type { AppSummary } from '@/types';

const apps = [
  { id: 'rechner-1', name: 'Rechner', icon: '🧮' },
  { id: 'editor-2', name: 'Editor', icon: '📝' },
  { id: 'malen-3', name: 'Malen', icon: '🎨' },
] as unknown as AppSummary[];

/** Die Ansichten der Schale, wie core/system sie führt. */
const systems: DockSystem[] = [
  { id: 'explorer', title: 'Dateien', icon: '📁' },
  { id: 'settings', title: 'Einstellungen', icon: '⚙️' },
];

/** Ein offenes Fenster, wie der Desktop es führt. */
function win(over: Partial<DockWindow> = {}): DockWindow {
  return {
    instanceId: 'win-1',
    appId: 'rechner-1',
    systemId: null,
    title: 'Rechner',
    icon: '🧮',
    minimized: false,
    ...over,
  };
}

/** Ein Fenster einer Ansicht der Schale (Explorer, Einstellungen). */
function sysWin(systemId: string, over: Partial<DockWindow> = {}): DockWindow {
  return win({ instanceId: `win-${systemId}`, appId: null, systemId, title: systemId, icon: '❓', ...over });
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

describe('dockEntries mit den Ansichten der Schale', () => {
  it('stellt sie immer voran — auch wenn nichts läuft und nichts behalten wird', () => {
    const entries = dockEntries(apps, [], [], systems);
    expect(entries.map((e) => e.title)).toEqual(['Dateien', 'Einstellungen']);
    expect(entries.map((e) => e.systemId)).toEqual(['explorer', 'settings']);
    expect(entries.every((e) => !e.running && !e.favorite && e.appId === null)).toBe(true);
  });

  it('setzt sie vor die Lieblinge und alles Laufende', () => {
    const entries = dockEntries(apps, [win({ appId: 'malen-3' })], ['editor-2'], systems);
    expect(entries.map((e) => e.title)).toEqual(['Dateien', 'Einstellungen', 'Editor', 'Malen']);
  });

  it('markiert die offene Ansicht als laufend und merkt sich ihr Fenster', () => {
    const entries = dockEntries(apps, [sysWin('settings', { minimized: true })], [], systems);
    expect(entries[0]).toMatchObject({ systemId: 'explorer', running: false, instanceId: null });
    expect(entries[1]).toMatchObject({
      systemId: 'settings',
      instanceId: 'win-settings',
      running: true,
      minimized: true,
    });
  });

  it('führt eine offene Ansicht nur einmal — nicht noch einmal als laufendes Fenster', () => {
    const entries = dockEntries(apps, [sysWin('explorer'), win({ instanceId: 'win-9' })], [], systems);
    expect(entries.map((e) => e.key)).toEqual(['sys:explorer', 'sys:settings', 'rechner-1']);
  });

  it('nennt sie so, wie die Schale sie nennt — nicht wie ihr Fenster heißt', () => {
    const [explorer] = dockEntries(apps, [sysWin('explorer', { title: 'Alt', icon: '❓' })], [], systems);
    expect(explorer).toMatchObject({ title: 'Dateien', icon: '📁' });
  });

  it('hängt ein Fenster einer unbekannten Ansicht hinten an, statt es zu verlieren', () => {
    const entries = dockEntries(apps, [sysWin('gibt-es-nicht', { title: 'Fremd' })], [], systems);
    expect(entries.map((e) => e.key)).toEqual(['sys:explorer', 'sys:settings', 'win-gibt-es-nicht']);
    expect(entries[2]).toMatchObject({ title: 'Fremd', running: true, systemId: 'gibt-es-nicht' });
  });

  it('hält ihren Platz von den App-Ids frei (eine App „explorer“ steht daneben)', () => {
    const eigen = [{ id: 'explorer', name: 'Meine App', icon: '🧩' }] as unknown as AppSummary[];
    const entries = dockEntries(eigen, [], ['explorer'], systems);
    expect(entries.map((e) => e.key)).toEqual(['sys:explorer', 'sys:settings', 'explorer']);
    expect(entries[2]).toMatchObject({ title: 'Meine App', favorite: true });
  });
});

describe('cleanAutohide', () => {
  it('nimmt nur ein Ja oder ein Nein an', () => {
    expect(cleanAutohide(true)).toBe(true);
    expect(cleanAutohide(false)).toBe(false);
  });

  it('weist alles zurück, was keine Entscheidung ist', () => {
    expect(cleanAutohide(1)).toBeNull();
    expect(cleanAutohide('true')).toBeNull();
    expect(cleanAutohide(null)).toBeNull();
    expect(cleanAutohide(undefined)).toBeNull();
    expect(cleanAutohide({})).toBeNull();
  });
});

describe('cleanAutohides', () => {
  it('behält die brauchbaren Einträge und wirft den Rest weg', () => {
    expect(
      cleanAutohides({ '/apps': true, '/andere': false, '/kaputt': 'ja', '/auch': null }),
    ).toEqual({ '/apps': true, '/andere': false });
  });

  it('macht aus allem, was kein Objekt ist, eine leere Sammlung', () => {
    expect(cleanAutohides(undefined)).toEqual({});
    expect(cleanAutohides(null)).toEqual({});
    expect(cleanAutohides('nein')).toEqual({});
  });
});

describe('cleanDockEdge', () => {
  it('nimmt jeden der vier Ränder an', () => {
    expect(cleanDockEdge('bottom')).toBe('bottom');
    expect(cleanDockEdge('left')).toBe('left');
    expect(cleanDockEdge('right')).toBe('right');
    expect(cleanDockEdge('top')).toBe('top');
  });

  it('weist alles zurück, was kein Rand ist', () => {
    expect(cleanDockEdge('unten')).toBeNull();
    expect(cleanDockEdge('')).toBeNull();
    expect(cleanDockEdge(0)).toBeNull();
    expect(cleanDockEdge(null)).toBeNull();
    expect(cleanDockEdge(undefined)).toBeNull();
    expect(cleanDockEdge({})).toBeNull();
  });

  it('steht von Haus aus unten — dort, wo das Dock seit c0052 stand', () => {
    expect(DEFAULT_DOCK_EDGE).toBe('bottom');
    expect(DOCK_EDGES[0].id).toBe(DEFAULT_DOCK_EDGE);
    expect(DOCK_EDGES.map((e) => e.id)).toEqual(['bottom', 'left', 'right', 'top']);
    // Jeder Rand hat eine Aufschrift für die Einstellungen.
    expect(DOCK_EDGES.every((e) => e.label.length > 0)).toBe(true);
  });
});

describe('cleanDockEdges', () => {
  it('behält die brauchbaren Einträge und wirft den Rest weg', () => {
    expect(
      cleanDockEdges({ '/apps': 'left', '/andere': 'top', '/kaputt': 'schräg', '/auch': null }),
    ).toEqual({ '/apps': 'left', '/andere': 'top' });
  });

  it('macht aus allem, was kein Objekt ist, eine leere Sammlung', () => {
    expect(cleanDockEdges(undefined)).toEqual({});
    expect(cleanDockEdges(null)).toEqual({});
    expect(cleanDockEdges('links')).toEqual({});
  });
});

describe('dockRevealed', () => {
  it('lässt das Dock ohne Ausblenden immer stehen', () => {
    expect(dockRevealed(false, false, false)).toBe(true);
    expect(DEFAULT_DOCK_AUTOHIDE).toBe(false);
  });

  it('holt es hervor, solange der Zeiger unten ist', () => {
    expect(dockRevealed(true, false, false)).toBe(false);
    expect(dockRevealed(true, true, false)).toBe(true);
  });

  it('hält es fest, solange etwas darin die Aufmerksamkeit hat', () => {
    // Die Tastatur ist hineingegangen, oder das Menü eines Platzes steht offen.
    expect(dockRevealed(true, false, true)).toBe(true);
  });
});
