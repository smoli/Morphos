import type { ElementRef } from '@/types';
import { insertIntoHead } from './appfs';

/**
 * Höchstzahl markierter Elemente je Wunsch: Die Referenzen gehen als Text in den
 * Prompt — eine App könnte sonst über die Brücke beliebig viel hineinschreiben.
 */
export const MAX_ELEMENT_REFS = 8;

/** Deckel der einzelnen Angaben einer Referenz (die App liefert sie, nicht wir). */
const MAX_TEXT = 200;
const MAX_SELECTOR = 300;
const MAX_SOURCE = 200;
const MAX_CLASSES = 6;
const MAX_CLASS = 60;
/** Wie viel Text auf ein Kärtchen im Composer passt. */
const MAX_LABEL_TEXT = 24;

/**
 * Der in die erzeugte App injizierte Element-Picker. Er läuft wie die
 * Dateisystem-Brücke (core/appfs) im Sandbox-iframe und spricht ausschließlich
 * per postMessage mit der Shell — er braucht keine zusätzliche Fähigkeit der
 * Sandbox und lockert die CSP nicht.
 *
 * Protokoll:
 *   Shell → App  { __morphosPick: 'mode', on }        Pick-Modus an/aus
 *   App → Shell  { __morphosPick: 'picked', ref }     angeklicktes Element
 *   App → Shell  { __morphosPick: 'exit' }            Escape in der App
 *
 * Als roher Template-String (String.raw) geschrieben: Das Skript enthält
 * reguläre Ausdrücke, deren Backslashes sonst beim Einbetten verloren gingen.
 */
export const PICKER_SDK = String.raw`(function(){
  if (window.__morphosPick) return;
  var on = false, box = null;

  // Die Markierung liegt im Dokument der App (eine andere Fläche gibt es im
  // sandboxed iframe nicht), fängt aber nichts ab und ist als solche erkennbar.
  function overlay(){
    if (box) return box;
    box = document.createElement('div');
    box.setAttribute('data-morphos-pick', '');
    var s = box.style;
    s.position = 'fixed'; s.pointerEvents = 'none'; s.zIndex = '2147483647';
    s.display = 'none'; s.boxSizing = 'border-box';
    s.border = '2px solid #4c8dff'; s.background = 'rgba(76,141,255,0.18)';
    s.borderRadius = '3px';
    document.documentElement.appendChild(box);
    return box;
  }
  function show(el){
    var r = el.getBoundingClientRect(), s = overlay().style;
    s.display = 'block';
    s.left = r.left + 'px'; s.top = r.top + 'px';
    s.width = r.width + 'px'; s.height = r.height + 'px';
  }
  function hide(){ if (box) box.style.display = 'none'; }

  // Klassen, die wie erzeugte Hashes aussehen, taugen nicht als Wegmarke.
  function classes(el){
    var out = [], list = (el.getAttribute('class') || '').split(/\s+/);
    for (var i = 0; i < list.length; i++){
      var c = list[i];
      if (c && c.length < 40 && !/^[0-9]/.test(c) && !/[0-9]{4,}/.test(c)) out.push(c);
    }
    return out;
  }
  function position(el){
    var i = 1, s = el;
    while (s.previousElementSibling){ s = s.previousElementSibling; if (s.tagName === el.tagName) i++; }
    return i;
  }
  function step(el){
    var id = el.getAttribute('id');
    if (id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id) && document.querySelectorAll('#' + id).length === 1) {
      return '#' + id;
    }
    var sel = el.tagName.toLowerCase(), cs = classes(el);
    if (cs.length) sel += '.' + cs.slice(0, 2).join('.');
    var parent = el.parentElement;
    if (parent){
      var same = 0, kids = parent.children;
      for (var i = 0; i < kids.length; i++) if (kids[i].tagName === el.tagName) same++;
      if (same > 1) sel += ':nth-of-type(' + position(el) + ')';
    }
    return sel;
  }
  function selector(el){
    var parts = [], node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement){
      var s = step(node);
      parts.unshift(s);
      if (s.charAt(0) === '#') break; // eine Id ist ein Anker — darüber braucht es nichts
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function describeEl(el){
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    var r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.getAttribute('id') || '',
      classes: classes(el),
      text: text.length > 200 ? text.slice(0, 200) : text,
      selector: selector(el),
      source: el.getAttribute('data-morphos-src') || '',
      rect: { x: r.left, y: r.top, w: r.width, h: r.height }
    };
  }
  function target(e){
    var el = e.target;
    return el && el.nodeType === 1 && el !== box ? el : null;
  }
  function setMode(next){
    on = !!next;
    if (!on) hide();
    try { document.documentElement.style.cursor = on ? 'crosshair' : ''; } catch (err) { /* egal */ }
  }
  document.addEventListener('mousemove', function(e){
    if (!on) return;
    var el = target(e);
    if (el) show(el);
  }, true);
  document.addEventListener('mouseout', function(e){
    if (on && !e.relatedTarget) hide();
  }, true);
  // In der Auswahl gehört jeder Klick der Shell — die App darf ihn nicht als
  // Bedienung verstehen (ein Knopf soll beim Markieren nichts auslösen).
  document.addEventListener('click', function(e){
    if (!on) return;
    e.preventDefault();
    e.stopPropagation();
    var el = target(e);
    if (el) parent.postMessage({ __morphosPick: 'picked', ref: describeEl(el) }, '*');
  }, true);
  document.addEventListener('keydown', function(e){
    if (!on || e.key !== 'Escape') return;
    e.preventDefault();
    setMode(false);
    parent.postMessage({ __morphosPick: 'exit' }, '*');
  }, true);
  window.addEventListener('message', function(e){
    var d = e.data;
    if (d && d.__morphosPick === 'mode') setMode(d.on);
  });
  window.__morphosPick = true;
})();`;

/** Fügt den Element-Picker in ein HTML-Dokument ein (einmalig). */
export function injectPicker(html: string): string {
  if (!html) return html;
  if (html.includes('data-morphos-picker')) return html;
  return insertIntoHead(html, `<script data-morphos-picker>${PICKER_SDK}</script>`);
}

/** Kürzt einen Text mit Auslassungszeichen. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Prüft und beschneidet die Beschreibung, die die App über die Brücke meldet.
 * Sie kommt aus generiertem Code — was hier durchgeht, landet später im Prompt,
 * also nur einfache, gedeckelte Werte.
 */
export function sanitizeRef(raw: unknown): ElementRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const tag = str(r.tag).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const selector = str(r.selector).slice(0, MAX_SELECTOR);
  if (!tag || !selector) return null;

  const id = str(r.id).slice(0, 100);
  const text = clip(str(r.text), MAX_TEXT);
  const source = str(r.source).slice(0, MAX_SOURCE);
  const classes = Array.isArray(r.classes)
    ? r.classes.filter((c): c is string => typeof c === 'string' && c.length > 0)
        .map((c) => c.slice(0, MAX_CLASS))
        .slice(0, MAX_CLASSES)
    : [];

  const rect = r.rect && typeof r.rect === 'object' ? (r.rect as Record<string, unknown>) : null;
  const x = rect ? num(rect.x) : null;
  const y = rect ? num(rect.y) : null;
  const w = rect ? num(rect.w) : null;
  const h = rect ? num(rect.h) : null;

  return {
    tag,
    selector,
    ...(id ? { id } : {}),
    ...(classes.length ? { classes } : {}),
    ...(text ? { text } : {}),
    ...(source ? { source } : {}),
    ...(x !== null && y !== null && w !== null && h !== null ? { rect: { x, y, w, h } } : {}),
  };
}

/** Wie sanitizeRef, aber für eine ganze Liste (gedeckelt und ohne Dubletten). */
export function sanitizeRefs(raw: unknown): ElementRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ElementRef[] = [];
  for (const entry of raw) {
    const ref = sanitizeRef(entry);
    if (!ref || out.some((r) => refKey(r) === refKey(ref))) continue;
    out.push(ref);
    if (out.length >= MAX_ELEMENT_REFS) break;
  }
  return out;
}

/** Unterscheidungsmerkmal einer Referenz: ihr Weg im Dokument. */
export function refKey(ref: ElementRef): string {
  return ref.selector;
}

/** Beschriftung des Kärtchens im Composer: Tag und, wenn vorhanden, sein Text. */
export function refLabel(ref: ElementRef): string {
  const tag = `<${ref.tag}>`;
  return ref.text ? `${tag} „${clip(ref.text, MAX_LABEL_TEXT)}“` : tag;
}

/** Das Element als eine Zeile: Tag, Id, Klassen und Text. */
function headline(ref: ElementRef): string {
  const attrs = [
    ...(ref.id ? [`id="${ref.id}"`] : []),
    ...(ref.classes?.length ? [`class="${ref.classes.join(' ')}"`] : []),
  ].join(' ');
  const tag = `<${ref.tag}${attrs ? ` ${attrs}` : ''}>`;
  return ref.text ? `${tag} „${ref.text}“` : tag;
}

/**
 * Der Prompt-Abschnitt zu den markierten Elementen: Quellort, wenn das Bündeln
 * einen hinterlassen hat (siehe core/bundle: annotateSource) — sonst zählt die
 * Beschreibung, denn zur Laufzeit erzeugtes DOM hat keinen.
 */
export function formatElementRefs(refs: ElementRef[]): string[] {
  if (refs.length === 0) return [];
  const parts: string[] = ['REFERENZIERTE ELEMENTE (der Anwender hat sie in der laufenden App markiert):'];
  for (const ref of refs) {
    parts.push(`- ${headline(ref)}`);
    parts.push(
      ref.source
        ? `  Quelle: ${ref.source} (Datei:Zeile:Spalte — ändere genau dort)`
        : '  Quelle: kein Quell-Tag (zur Laufzeit erzeugt) — finde die Stelle über Selektor und Text',
    );
    parts.push(`  Selektor: ${ref.selector}`);
    if (ref.rect) parts.push(`  Im Fenster: ${ref.rect.w}×${ref.rect.h} px an (${ref.rect.x}, ${ref.rect.y})`);
  }
  parts.push('');
  return parts;
}
