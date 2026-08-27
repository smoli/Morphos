import { describe, it, expect } from 'vitest';
import { blockStrayDrops } from './drop';

/** Ein Zug-Ereignis, wie es beim Fallenlassen einer Datei entsteht. */
const dragEvent = (type: string): Event => new Event(type, { bubbles: true, cancelable: true });

describe('blockStrayDrops', () => {
  it('hält eine daneben fallengelassene Datei auf — sonst lüde sie die Schale', () => {
    const stop = blockStrayDrops(window);

    const drop = dragEvent('drop');
    window.dispatchEvent(drop);
    const over = dragEvent('dragover');
    window.dispatchEvent(over);

    expect(drop.defaultPrevented).toBe(true);
    expect(over.defaultPrevented).toBe(true);
    stop();
  });

  it('lässt sich wieder abmelden', () => {
    blockStrayDrops(window)();

    const drop = dragEvent('drop');
    window.dispatchEvent(drop);

    expect(drop.defaultPrevented).toBe(false);
  });

  it('steht dem im Weg, der die Datei annehmen will, nicht: Er ist zuerst dran', () => {
    const stop = blockStrayDrops(window);
    const zone = document.createElement('div');
    document.body.append(zone);
    let taken = false;
    zone.addEventListener('drop', (e) => {
      taken = true;
      e.preventDefault();
    });

    zone.dispatchEvent(dragEvent('drop'));

    expect(taken).toBe(true);
    stop();
    zone.remove();
  });
});
