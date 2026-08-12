import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PICKER_SDK,
  injectPicker,
  refKey,
  refLabel,
  sanitizeRef,
  sanitizeRefs,
  formatElementRefs,
  MAX_ELEMENT_REFS,
} from './pick';
import type { ElementRef } from '@/types';

// ---- Der injizierte Picker: er läuft im iframe der App, also wird er hier
//      genauso ausgeführt — als Skript über einem Dokument. `parent` ist in
//      jsdom das Fenster selbst, seine Nachrichten landen daher hier.

interface PickWindow extends Window {
  __morphosPick?: boolean;
}

const received: Record<string, unknown>[] = [];

function collect(e: MessageEvent): void {
  const d = e.data as Record<string, unknown>;
  if (d && d.__morphosPick && d.__morphosPick !== 'mode') received.push(d);
}

/** Lädt Markup und startet den Picker darüber (wie in der erzeugten App). */
function load(body: string): void {
  document.body.innerHTML = body;
  new Function(PICKER_SDK)();
}

/** postMessage ist auch in jsdom asynchron — einmal die Warteschlange leeren. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Schaltet den Pick-Modus, wie es die Shell tut. */
async function setMode(on: boolean): Promise<void> {
  window.postMessage({ __morphosPick: 'mode', on }, '*');
  await settle();
}

/** Klickt ein Element an und liefert die daraufhin gemeldete Referenz. */
async function pick(selector: string): Promise<ElementRef | null> {
  const el = document.querySelector(selector);
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle();
  const last = received[received.length - 1];
  return last?.__morphosPick === 'picked' ? (last.ref as ElementRef) : null;
}

describe('PICKER_SDK', () => {
  beforeEach(() => {
    received.length = 0;
    delete (window as PickWindow).__morphosPick;
    window.addEventListener('message', collect);
  });
  afterEach(() => {
    window.removeEventListener('message', collect);
    document.body.innerHTML = '';
  });

  it('meldet erst im Pick-Modus etwas — ein Klick davor bleibt stumm', async () => {
    load('<button id="save">Speichern</button>');
    expect(await pick('#save')).toBeNull();
    expect(received).toHaveLength(0);
  });

  it('meldet das angeklickte Element mit Tag, Id, Klassen und Text', async () => {
    load('<div class="bar"><button id="save" class="primary big">Speichern</button></div>');
    await setMode(true);
    const ref = await pick('#save');
    expect(ref).toMatchObject({ tag: 'button', id: 'save', text: 'Speichern' });
    expect(ref?.classes).toEqual(['primary', 'big']);
  });

  it('fasst den Text zusammen (Umbrüche, Mehrfach-Leerzeichen)', async () => {
    load('<p class="t">Hallo\n   schöne    Welt</p>');
    await setMode(true);
    expect((await pick('.t'))?.text).toBe('Hallo schöne Welt');
  });

  it('baut einen CSS-Pfad, der genau dieses Element trifft', async () => {
    load('<main><ul><li>eins</li><li class="ziel">zwei</li></ul></main>');
    await setMode(true);
    const ref = await pick('.ziel');
    expect(ref?.selector).toBeTruthy();
    expect(document.querySelectorAll(ref!.selector)).toHaveLength(1);
    expect(document.querySelector(ref!.selector)?.textContent).toBe('zwei');
    // Gleichartige Geschwister werden über ihre Stellung unterschieden.
    expect(ref!.selector).toContain('nth-of-type');
  });

  it('verankert den Pfad an einer eindeutigen Id (kurz und stabil)', async () => {
    load('<div><section><span id="ziel">x</span></section></div>');
    await setMode(true);
    expect((await pick('#ziel'))?.selector).toBe('#ziel');
  });

  it('nimmt den Quellort aus data-morphos-src mit', async () => {
    load('<button data-morphos-src="src/index.html:12:5">OK</button>');
    await setMode(true);
    expect((await pick('button'))?.source).toBe('src/index.html:12:5');
  });

  it('kommt ohne Quell-Tag aus (zur Laufzeit erzeugtes DOM)', async () => {
    load('<div id="app"></div>');
    document.getElementById('app')!.appendChild(document.createElement('button'));
    await setMode(true);
    const ref = await pick('#app button');
    expect(ref?.tag).toBe('button');
    expect(ref?.source).toBeFalsy();
    expect(document.querySelectorAll(ref!.selector)).toHaveLength(1);
  });

  it('hebt das überfahrene Element hervor und räumt die Markierung wieder weg', async () => {
    load('<button id="save">Speichern</button>');
    await setMode(true);
    document.getElementById('save')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    const box = document.querySelector('[data-morphos-pick]') as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.style.display).toBe('block');
    // Die Markierung darf nichts abfangen — sie liegt nur obenauf.
    expect(box.style.pointerEvents).toBe('none');
    await setMode(false);
    expect(box.style.display).toBe('none');
  });

  it('verschluckt den Klick, damit die App ihn nicht als Bedienung versteht', async () => {
    load('<button id="save">Speichern</button>');
    await setMode(true);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('save')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('verlässt den Modus mit Escape und sagt es der Shell', async () => {
    load('<button>OK</button>');
    await setMode(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(received.some((m) => m.__morphosPick === 'exit')).toBe(true);
    // Danach ist der Modus aus: ein Klick meldet nichts mehr.
    received.length = 0;
    expect(await pick('button')).toBeNull();
  });

  it('kommt ohne die Fähigkeiten der Sandbox aus (nur postMessage)', () => {
    expect(PICKER_SDK).toContain('postMessage');
    for (const forbidden of ['localStorage', 'fetch(', 'XMLHttpRequest', 'eval(']) {
      expect(PICKER_SDK).not.toContain(forbidden);
    }
  });
});

describe('injectPicker', () => {
  it('setzt das Picker-Skript in den Kopf des Dokuments', () => {
    const out = injectPicker('<html><head><title>X</title></head><body></body></html>');
    expect(out).toContain('data-morphos-picker');
    expect(out.indexOf('data-morphos-picker')).toBeLessThan(out.indexOf('</head>'));
  });

  it('injiziert nicht doppelt und lässt leeres HTML in Ruhe', () => {
    const once = injectPicker('<html><head></head><body></body></html>');
    expect(injectPicker(once)).toBe(once);
    expect(injectPicker('')).toBe('');
  });
});

describe('sanitizeRef', () => {
  const good = {
    tag: 'BUTTON',
    id: 'save',
    classes: ['primary'],
    text: 'Speichern',
    selector: 'body > button#save',
    source: 'src/index.html:12:5',
    rect: { x: 4.6, y: 8.2, w: 120, h: 32 },
  };

  it('übernimmt eine vollständige Beschreibung (Tag klein geschrieben)', () => {
    expect(sanitizeRef(good)).toEqual({ ...good, tag: 'button', rect: { x: 5, y: 8, w: 120, h: 32 } });
  });

  it('verwirft, was keine Beschreibung ist', () => {
    for (const bad of [null, 42, 'x', {}, { tag: '' }]) expect(sanitizeRef(bad)).toBeNull();
  });

  it('kappt überlange Angaben der App (der Prompt gehört nicht ihr)', () => {
    const ref = sanitizeRef({ tag: 'div', selector: 'a'.repeat(5000), text: 'b'.repeat(5000) });
    expect(ref!.selector.length).toBeLessThanOrEqual(300);
    expect(ref!.text!.length).toBeLessThanOrEqual(201);
  });

  it('lässt nur einfache Werte durch (keine Objekte, keine Funktionen)', () => {
    const ref = sanitizeRef({ tag: 'div', selector: 'div', classes: ['a', 42, { x: 1 }], rect: 'nein' });
    expect(ref!.classes).toEqual(['a']);
    expect(ref!.rect).toBeUndefined();
  });

  it('nimmt höchstens so viele Referenzen an, wie der Prompt verträgt', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ tag: 'div', selector: `#d${i}` }));
    expect(sanitizeRefs(many)).toHaveLength(MAX_ELEMENT_REFS);
    expect(sanitizeRefs('nein')).toEqual([]);
  });
});

describe('refKey / refLabel', () => {
  it('unterscheidet Referenzen am Selektor', () => {
    expect(refKey({ tag: 'div', selector: '#a' })).not.toBe(refKey({ tag: 'div', selector: '#b' }));
  });

  it('beschriftet das Kärtchen mit Tag und Text', () => {
    expect(refLabel({ tag: 'button', selector: '#a', text: 'Speichern' })).toBe('<button> „Speichern“');
    expect(refLabel({ tag: 'div', selector: '#a' })).toBe('<div>');
    const long = refLabel({ tag: 'p', selector: '#a', text: 'x'.repeat(60) });
    expect(long.length).toBeLessThanOrEqual(32);
    expect(long.endsWith('…“')).toBe(true);
  });
});

describe('formatElementRefs', () => {
  const refs: ElementRef[] = [
    {
      tag: 'button',
      id: 'save',
      classes: ['primary'],
      text: 'Speichern',
      selector: 'body > div.bar > button#save',
      source: 'src/index.html:12:5',
      rect: { x: 40, y: 18, w: 120, h: 32 },
    },
    { tag: 'li', selector: 'body > ul > li:nth-of-type(2)', text: 'zwei' },
  ];

  it('nennt jedes markierte Element mit Beschreibung und Quellort', () => {
    const text = formatElementRefs(refs).join('\n');
    expect(text).toContain('REFERENZIERTE ELEMENTE');
    expect(text).toContain('<button id="save" class="primary">');
    expect(text).toContain('„Speichern“');
    expect(text).toContain('src/index.html:12:5');
    expect(text).toContain('body > div.bar > button#save');
    expect(text).toContain('120×32');
  });

  it('sagt beim fehlenden Quellort, dass der Selektor der Weg ist', () => {
    const text = formatElementRefs([refs[1]]).join('\n');
    expect(text).toContain('kein Quell-Tag');
    expect(text).toContain('body > ul > li:nth-of-type(2)');
  });

  it('liefert nichts, wenn nichts markiert ist', () => {
    expect(formatElementRefs([])).toEqual([]);
  });
});
