import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_AGENTS,
  MAX_AGENTS_LIMIT,
  busyAppKeys,
  clampMaxAgents,
  createSerialQueue,
  isAppBusy,
  runningCount,
  startableJobs,
} from './queue';
import type { QueueEntry } from './queue';

/** Kurzschreibweise für einen Eintrag: Id, App-Schlüssel, Zustand. */
const job = (jobId: string, appKey: string, state: 'queued' | 'running' = 'queued'): QueueEntry => ({
  jobId,
  appKey,
  state,
});

const ids = (entries: readonly QueueEntry[]): string[] => entries.map((e) => e.jobId);

describe('clampMaxAgents', () => {
  it('nimmt zwei als Vorgabe, wenn nichts Brauchbares kommt', () => {
    expect(DEFAULT_MAX_AGENTS).toBe(2);
    expect(clampMaxAgents(undefined)).toBe(2);
    expect(clampMaxAgents(null)).toBe(2);
    expect(clampMaxAgents('drei')).toBe(2);
    expect(clampMaxAgents(NaN)).toBe(2);
  });

  it('hält den Wert zwischen eins und der Obergrenze', () => {
    expect(clampMaxAgents(0)).toBe(1);
    expect(clampMaxAgents(-5)).toBe(1);
    expect(clampMaxAgents(1)).toBe(1);
    expect(clampMaxAgents(4)).toBe(4);
    expect(clampMaxAgents(MAX_AGENTS_LIMIT + 3)).toBe(MAX_AGENTS_LIMIT);
  });

  it('rundet Kommazahlen ab', () => {
    expect(clampMaxAgents(2.9)).toBe(2);
  });
});

describe('runningCount / isAppBusy / busyAppKeys', () => {
  const jobs = [job('1', 'a', 'running'), job('2', 'a'), job('3', 'b')];

  it('zählt nur die laufenden Aufträge', () => {
    expect(runningCount(jobs)).toBe(1);
    expect(runningCount([])).toBe(0);
  });

  it('meldet eine App als beschäftigt, ob laufend oder wartend', () => {
    expect(isAppBusy(jobs, 'a')).toBe(true);
    expect(isAppBusy(jobs, 'b')).toBe(true); // wartet nur — trotzdem beschäftigt
    expect(isAppBusy(jobs, 'c')).toBe(false);
  });

  it('sammelt die Schlüssel aller beschäftigten Apps', () => {
    expect(busyAppKeys(jobs)).toEqual(new Set(['a', 'b']));
  });
});

describe('startableJobs', () => {
  it('startet nichts, solange nichts wartet', () => {
    expect(startableJobs([], 2)).toEqual([]);
    expect(startableJobs([job('1', 'a', 'running')], 2)).toEqual([]);
  });

  it('füllt die freien Plätze in der Reihenfolge des Eingangs (FIFO)', () => {
    const jobs = [job('1', 'a'), job('2', 'b'), job('3', 'c')];
    expect(ids(startableJobs(jobs, 2))).toEqual(['1', '2']);
  });

  it('lässt den Deckel nicht überschreiten — laufende Aufträge belegen Plätze', () => {
    const jobs = [job('1', 'a', 'running'), job('2', 'b'), job('3', 'c')];
    expect(ids(startableJobs(jobs, 2))).toEqual(['2']);
  });

  it('startet gar nichts, wenn alle Plätze belegt sind', () => {
    const jobs = [job('1', 'a', 'running'), job('2', 'b', 'running'), job('3', 'c')];
    expect(startableJobs(jobs, 2)).toEqual([]);
  });

  it('lässt je App höchstens einen Agenten laufen (der zweite wartet)', () => {
    const jobs = [job('1', 'a', 'running'), job('2', 'a')];
    expect(startableJobs(jobs, 4)).toEqual([]);
  });

  it('überspringt eine beschäftigte App und nimmt den nächsten Wunsch einer anderen', () => {
    const jobs = [job('1', 'a', 'running'), job('2', 'a'), job('3', 'b')];
    expect(ids(startableJobs(jobs, 2))).toEqual(['3']);
  });

  it('startet aus zwei Wünschen derselben App nur den ersten', () => {
    const jobs = [job('1', 'a'), job('2', 'a'), job('3', 'a')];
    expect(ids(startableJobs(jobs, 3))).toEqual(['1']);
  });

  it('gibt nach dem Ende eines Laufs den nächsten Wunsch derselben App frei', () => {
    const before = [job('1', 'a', 'running'), job('2', 'a')];
    expect(startableJobs(before, 2)).toEqual([]);
    // Auftrag 1 ist fertig und aus der Liste verschwunden.
    expect(ids(startableJobs([job('2', 'a')], 2))).toEqual(['2']);
  });

  it('behandelt einen Deckel von eins als streng nacheinander', () => {
    const jobs = [job('1', 'a'), job('2', 'b')];
    expect(ids(startableJobs(jobs, 1))).toEqual(['1']);
  });

  it('verändert die übergebene Liste nicht', () => {
    const jobs = [job('1', 'a'), job('2', 'b')];
    const copy = JSON.parse(JSON.stringify(jobs));
    startableJobs(jobs, 2);
    expect(jobs).toEqual(copy);
  });
});

describe('createSerialQueue', () => {
  /** Eine Arbeit, die erst auf Zuruf fertig wird. */
  function deferred(): { promise: Promise<string>; done: (value: string) => void } {
    let done = (_value: string): void => {};
    const promise = new Promise<string>((resolve) => {
      done = resolve;
    });
    return { promise, done };
  }

  it('lässt zwei Arbeiten desselben Schlüssels nicht gleichzeitig laufen', async () => {
    const queue = createSerialQueue();
    const first = deferred();
    const started: string[] = [];

    const a = queue.run('app', () => {
      started.push('a');
      return first.promise;
    });
    const b = queue.run('app', async () => {
      started.push('b');
      return 'b';
    });

    // Der zweite Auftrag hat noch nicht einmal begonnen.
    await Promise.resolve();
    expect(started).toEqual(['a']);

    first.done('a');
    expect(await a).toBe('a');
    expect(await b).toBe('b');
    expect(started).toEqual(['a', 'b']);
  });

  it('lässt verschiedene Schlüssel nebeneinander laufen', async () => {
    const queue = createSerialQueue();
    const first = deferred();
    const started: string[] = [];

    const a = queue.run('app-1', () => {
      started.push('a');
      return first.promise;
    });
    const b = queue.run('app-2', async () => {
      started.push('b');
      return 'b';
    });

    expect(await b).toBe('b');
    expect(started).toEqual(['a', 'b']);
    first.done('a');
    expect(await a).toBe('a');
  });

  it('reißt die Reihe nicht ab, wenn eine Arbeit scheitert', async () => {
    const queue = createSerialQueue();
    const failed = queue.run('app', async () => {
      throw new Error('kaputt');
    });
    const next = queue.run('app', async () => 'weiter');

    await expect(failed).rejects.toThrow('kaputt');
    expect(await next).toBe('weiter');
  });

  it('gibt den Schlüssel wieder frei, wenn nichts mehr ansteht', async () => {
    const queue = createSerialQueue();
    await queue.run('app', async () => 'fertig');
    await Promise.resolve();
    expect(queue.size()).toBe(0);
  });
});
