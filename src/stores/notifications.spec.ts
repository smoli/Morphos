import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNotificationsStore } from './notifications';
import { MAX_TOASTS, TOAST_TIMEOUTS } from '@/core/toasts';

describe('useNotificationsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('beginnt leer', () => {
    expect(useNotificationsStore().toasts).toEqual([]);
  });

  it('nimmt eine Meldung an und legt sie oben auf den Stapel', () => {
    const notes = useNotificationsStore();
    const id = notes.notify({ kind: 'success', text: 'Gespeichert' });

    expect(notes.toasts).toHaveLength(1);
    expect(notes.toasts[0]).toMatchObject({ id, kind: 'success', text: 'Gespeichert' });
  });

  it('nimmt eine Meldung ohne Art als Hinweis an', () => {
    const notes = useNotificationsStore();
    notes.notify({ text: 'Nur so' });
    expect(notes.toasts[0].kind).toBe('info');
  });

  it('vergibt für jede Meldung eine eigene Id', () => {
    const notes = useNotificationsStore();
    const a = notes.notify({ text: 'eins' });
    const b = notes.notify({ text: 'eins' });
    expect(a).not.toBe(b);
  });

  it('nimmt keine leere Meldung an', () => {
    const notes = useNotificationsStore();
    expect(notes.notify({ text: '   ' })).toBeNull();
    expect(notes.toasts).toEqual([]);
  });

  describe('von selbst verblassen', () => {
    it('nimmt Hinweis und Erfolg nach ihrer Standzeit weg', () => {
      const notes = useNotificationsStore();
      notes.info('Hinweis');
      notes.success('Fertig');

      vi.advanceTimersByTime(TOAST_TIMEOUTS.info - 1);
      expect(notes.toasts).toHaveLength(2);

      vi.advanceTimersByTime(2);
      expect(notes.toasts).toEqual([]);
    });

    it('lässt einen Fehler stehen, bis er weggeklickt wird', () => {
      const notes = useNotificationsStore();
      notes.error('Das ging schief');

      vi.advanceTimersByTime(60_000);
      expect(notes.toasts).toHaveLength(1);

      notes.dismiss(notes.toasts[0].id);
      expect(notes.toasts).toEqual([]);
    });
  });

  describe('Wegklicken', () => {
    it('nimmt genau die angeklickte Meldung weg', () => {
      const notes = useNotificationsStore();
      const a = notes.info('eins')!;
      notes.info('zwei');

      notes.dismiss(a);

      expect(notes.toasts.map((t) => t.text)).toEqual(['zwei']);
    });

    it('lässt eine schon weggeklickte Meldung nicht wiederkommen', () => {
      const notes = useNotificationsStore();
      const id = notes.info('eins')!;
      notes.dismiss(id);
      notes.info('zwei');

      // Die Uhr der ersten Meldung läuft ab — sie darf nichts mehr anfassen.
      vi.advanceTimersByTime(TOAST_TIMEOUTS.info + 1);
      expect(notes.toasts).toEqual([]);
    });

    it('räumt mit clear() den ganzen Stapel ab', () => {
      const notes = useNotificationsStore();
      notes.info('eins');
      notes.error('zwei');

      notes.clear();

      expect(notes.toasts).toEqual([]);
    });
  });

  describe('Deckel', () => {
    it('lässt nie mehr als MAX_TOASTS gleichzeitig liegen und wirft die ältesten ab', () => {
      const notes = useNotificationsStore();
      for (let i = 1; i <= MAX_TOASTS + 2; i += 1) notes.info(`m${i}`);

      expect(notes.toasts).toHaveLength(MAX_TOASTS);
      expect(notes.toasts[0].text).toBe('m3');
      expect(notes.toasts.at(-1)!.text).toBe(`m${MAX_TOASTS + 2}`);
    });

    it('wirft auch stehende Fehler ab, wenn der Stapel überläuft', () => {
      const notes = useNotificationsStore();
      for (let i = 1; i <= MAX_TOASTS + 1; i += 1) notes.error(`f${i}`);

      expect(notes.toasts).toHaveLength(MAX_TOASTS);
      expect(notes.toasts[0].text).toBe('f2');
    });
  });
});
