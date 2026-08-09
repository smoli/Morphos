import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FolderWatchers, WATCH_DEBOUNCE_MS, type WatchFactory } from './watch';

/** Eine Attrappe für fs.watch: merkt sich, was beobachtet wird, und feuert auf Zuruf. */
function fakeWatch(): { watched: FakeWatch[]; factory: WatchFactory } {
  const watched: FakeWatch[] = [];
  const factory: WatchFactory = (abs, onEvent) => {
    const w: FakeWatch = { path: abs, fire: onEvent, closed: false };
    watched.push(w);
    return { close: () => { w.closed = true; } };
  };
  return { watched, factory };
}

interface FakeWatch {
  path: string;
  fire: () => void;
  closed: boolean;
}

const ROOT = path.resolve('/daten');

describe('FolderWatchers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('beobachtet den aufgelösten Ordner innerhalb des Datenordners', () => {
    const { watched, factory } = fakeWatch();
    const watchers = new FolderWatchers({ factory });

    const id = watchers.start(1, ROOT, 'notizen', () => {});

    expect(id).not.toBeNull();
    expect(watched).toHaveLength(1);
    expect(watched[0].path).toBe(path.join(ROOT, 'notizen'));
  });

  it('weist einen Pfad oberhalb des Datenordners ab', () => {
    const { watched, factory } = fakeWatch();
    const watchers = new FolderWatchers({ factory });

    expect(watchers.start(1, ROOT, '../geheim', () => {})).toBeNull();
    expect(watchers.start(1, ROOT, 'notizen/../../geheim', () => {})).toBeNull();
    expect(watched).toHaveLength(0);
    expect(watchers.size).toBe(0);
  });

  it('behandelt einen absoluten Pfad als relativ zum Datenordner', () => {
    const { watched, factory } = fakeWatch();
    const watchers = new FolderWatchers({ factory });

    expect(watchers.start(1, ROOT, '/etc')).not.toBeNull();
    expect(watched[0].path).toBe(path.join(ROOT, 'etc'));
  });

  it('meldet eine Änderung — mehrere kurz hintereinander nur einmal', () => {
    const { watched, factory } = fakeWatch();
    const watchers = new FolderWatchers({ factory });
    const notify = vi.fn();

    const id = watchers.start(1, ROOT, '', notify)!;
    watched[0].fire();
    watched[0].fire();
    watched[0].fire();
    expect(notify).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(id);

    // Eine spätere Änderung wird wieder gemeldet.
    watched[0].fire();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('hört mit dem Beenden auf zu beobachten und zu melden', () => {
    const { watched, factory } = fakeWatch();
    const watchers = new FolderWatchers({ factory });
    const notify = vi.fn();

    const id = watchers.start(1, ROOT, '', notify)!;
    watched[0].fire();
    expect(watchers.stop(id)).toBe(true);

    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS * 10);
    expect(notify).not.toHaveBeenCalled();
    expect(watched[0].closed).toBe(true);
    expect(watchers.size).toBe(0);
    // Ein zweites Beenden ist folgenlos.
    expect(watchers.stop(id)).toBe(false);
  });

  it('beendet mit dem Fenster alle seine Beobachter — die der anderen bleiben', () => {
    const { watched, factory } = fakeWatch();
    const watchers = new FolderWatchers({ factory });

    watchers.start(1, ROOT, '');
    watchers.start(1, ROOT, 'notizen');
    const fremd = watchers.start(2, ROOT, 'bilder')!;

    expect(watchers.stopAll(1)).toBe(2);
    expect(watched.filter((w) => w.closed)).toHaveLength(2);
    expect(watchers.size).toBe(1);
    expect(watchers.stop(fremd)).toBe(true);
  });

  it('vergibt für jeden Beobachter eine eigene Kennung', () => {
    const { factory } = fakeWatch();
    const watchers = new FolderWatchers({ factory });

    const ids = [watchers.start(1, ROOT, ''), watchers.start(1, ROOT, 'a'), watchers.start(2, ROOT, '')];
    expect(new Set(ids).size).toBe(3);
  });

  it('wirft, wenn sich der Ordner nicht beobachten lässt', () => {
    const watchers = new FolderWatchers({
      factory: () => { throw new Error('ENOENT'); },
    });

    expect(() => watchers.start(1, ROOT, 'weg')).toThrow('ENOENT');
    expect(watchers.size).toBe(0);
  });
});

describe('FolderWatchers mit echtem fs.watch', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'morphos-watch-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('meldet eine tatsächliche Änderung im Datenordner', async () => {
    const watchers = new FolderWatchers({ debounceMs: 10 });
    const changed = new Promise<string>((resolve) => {
      const id = watchers.start(1, root, '', resolve);
      expect(id).not.toBeNull();
    });

    // Bis die Meldung ankommt, immer wieder schreiben — ein einzelnes Ereignis
    // könnte zwischen Anmeldung und Beobachtung durchrutschen.
    let n = 0;
    const writing = setInterval(() => {
      fs.writeFileSync(path.join(root, `notiz-${n++}.txt`), 'hallo', 'utf8');
    }, 25);
    try {
      await changed;
    } finally {
      clearInterval(writing);
      watchers.stopAll(1);
    }
  }, 5000);
});
