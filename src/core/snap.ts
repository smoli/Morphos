/**
 * Das Ausrichten im UI-Entwurf (c0114): Kanten und Mitten rasten aneinander ein,
 * und während des Zugs sagen Hilfslinien, woran.
 *
 * Von Hand gezogene Kästen liegen nie ganz bündig — ein Tausendstel daneben
 * sieht man nicht, der Agent liest es aber als Absicht („die Liste beginnt ein
 * wenig weiter rechts als der Kopf“). Also rastet ein Zug ein: an den Kanten und
 * Mitten der ÜBRIGEN Kästen und an Rand und Mitte des Fensters.
 *
 * Wie in core/design ist alles hier rein und rechnet in ANTEILEN (0…1) — die
 * Reichweite `SNAP_RANGE` ist darum keine Pixelzahl, sondern ein Hundertstel des
 * Fensters: In einem schmalen Fenster rastet es feiner ein als in einem breiten,
 * und der Entwurf bedeutet in jeder Kachel dasselbe.
 *
 * Zwei Züge, zwei Regeln — und beide gibt es genau einmal, denn dieselbe
 * Rechnung zeigt das Gummiband an und legt hinterher den Kasten hin:
 *
 *   `snapMoved`  Schieben: Der ganze Kasten wandert um EINEN Betrag je Achse,
 *                seine Größe bleibt. Er hängt sich an die Linie, die einer seiner
 *                drei Anker (linke Kante, Mitte, rechte Kante) am nächsten
 *                erreicht.
 *   `snapSized`  Größerziehen und Zeichnen: Nur die angefasste Kante wandert (der
 *                Griff sagt welche), beim Zeichnen alle vier — jede für sich.
 *
 * Was nicht geht, geschieht nicht: Eine Linie, die den Zweig aus dem Fenster
 * führte oder den Kasten unter `MIN_BLOCK_SIZE` drückte, wird verworfen statt
 * hinterher zurechtgestutzt. Sonst zeigte die Hilfslinie eine Kante, an der der
 * Kasten am Ende gar nicht läge.
 */

import { MIN_BLOCK_SIZE, round, type Block, type Handle, type Rect } from './design';

/**
 * Wie nah eine Kante einer Linie kommen muss, damit sie einrastet: ein
 * Hundertstel des Fensters. Weiter gefasst schnappte ein Zug dorthin, wo niemand
 * ihn haben wollte; enger träfe man die Linie nur mit ruhiger Hand.
 */
export const SNAP_RANGE = 0.01;

/** Wieviel Rechenstaub beim Vergleich zweier Anteile durchgeht (vgl. core/design). */
const FIT = 1e-6;

/** Eine Hilfslinie: die Achse, auf der sie steht, und wo sie steht. */
export interface Guide {
  /** `x`: eine senkrechte Linie, `y`: eine waagerechte. */
  axis: 'x' | 'y';
  /** Ihr Anteil im Fenster (0…1). */
  at: number;
}

/** Die Linien, an denen sich ausrichten lässt — je Achse, aufsteigend. */
export interface Lines {
  x: number[];
  y: number[];
}

/** Was ein ausgerichteter Zug ergibt: die Fläche und die Linien, an denen sie hängt. */
export interface Snap {
  rect: Rect;
  guides: Guide[];
}

/**
 * Die Linien eines Entwurfs: von jedem Kasten beide Kanten und seine Mitte, dazu
 * Rand und Mitte des Fensters (0, 0.5, 1). Die Mitten sind kein Beiwerk — zwei
 * Kästen mittig untereinander ist eine der häufigsten Absichten überhaupt.
 *
 * `skipId` nimmt einen Kasten samt seinem ganzen ZWEIG heraus: Beim Anfassen
 * wandern seine Kinder mit ihm (c0109), sie wären also Ziele, die sich mitbewegen
 * — der Kasten liefe an seinen eigenen Kindern entlang, statt sich an den anderen
 * auszurichten.
 */
export function snapLines(blocks: readonly Block[], skipId?: string): Lines {
  const x = new Set<number>([0, 0.5, 1]);
  const y = new Set<number>([0, 0.5, 1]);
  const step = (list: readonly Block[]): void => {
    for (const b of list) {
      if (skipId !== undefined && b.id === skipId) continue;
      const r = b.rect;
      x.add(round(r.x)).add(round(r.x + r.w / 2)).add(round(r.x + r.w));
      y.add(round(r.y)).add(round(r.y + r.h / 2)).add(round(r.y + r.h));
      step(b.children);
    }
  };
  step(blocks);
  const up = (a: number, b: number): number => a - b;
  return { x: [...x].sort(up), y: [...y].sort(up) };
}

/**
 * Der Betrag, um den eine Fläche auf EINER Achse rücken muss, um einzurasten —
 * gesucht wird über ihre drei Anker (Kante, Mitte, Kante), und die nächste Linie
 * gewinnt. `lo` und `hi` begrenzen den Betrag: Was darüber hinausführte, ist
 * keine Wahl (der Zweig verließe das Fenster).
 */
function shiftTo(
  min: number,
  size: number,
  lines: readonly number[],
  range: number,
  lo: number,
  hi: number,
): { by: number; at: number | null } {
  let by = 0;
  let at: number | null = null;
  for (const anchor of [min, min + size / 2, min + size]) {
    for (const line of lines) {
      const delta = line - anchor;
      if (Math.abs(delta) > range + FIT) continue;
      if (delta < lo - FIT || delta > hi + FIT) continue;
      if (at !== null && Math.abs(delta) >= Math.abs(by)) continue;
      by = delta;
      at = line;
    }
  }
  return { by, at };
}

/**
 * Ein geschobener Kasten (c0109), ausgerichtet: Er wandert je Achse um einen
 * Betrag, seine Größe bleibt unangetastet.
 *
 * `bounds` ist — wie bei `moveRect` — die Fläche, die dabei im Fenster bleiben
 * muss: beim Kasten mit Kindern der ganze Zweig (`blockBounds`), sonst er selbst.
 * Sie ist hier schon MITGEWANDERT gedacht, denn ausgerichtet wird die Fläche, die
 * der Zug ergeben hat, nicht die, von der er ausging.
 */
export function snapMoved(rect: Rect, lines: Lines, bounds: Rect = rect, range = SNAP_RANGE): Snap {
  const dx = shiftTo(rect.x, rect.w, lines.x, range, -bounds.x, round(1 - (bounds.x + bounds.w)));
  const dy = shiftTo(rect.y, rect.h, lines.y, range, -bounds.y, round(1 - (bounds.y + bounds.h)));
  const guides: Guide[] = [];
  if (dx.at !== null) guides.push({ axis: 'x', at: dx.at });
  if (dy.at !== null) guides.push({ axis: 'y', at: dy.at });
  return {
    rect: { ...rect, x: round(rect.x + dx.by), y: round(rect.y + dy.by) },
    guides,
  };
}

/** Die Linie, an der eine einzelne Kante einrastet — `null`: keine ist nah genug. */
function edgeTo(
  value: number,
  lines: readonly number[],
  range: number,
  lo: number,
  hi: number,
): number | null {
  let at: number | null = null;
  let best = 0;
  for (const line of lines) {
    if (line < lo - FIT || line > hi + FIT) continue;
    const dist = Math.abs(line - value);
    if (dist > range + FIT) continue;
    if (at !== null && dist >= best) continue;
    at = line;
    best = dist;
  }
  return at;
}

/** Welche Kanten ein Zug bewegt: der Griff sagt es — ohne Griff (Zeichnen) alle vier. */
function edgesOf(handle: Handle | null): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
  if (!handle) return { left: true, right: true, top: true, bottom: true };
  return {
    left: handle.includes('w'),
    right: handle.includes('e'),
    top: handle.includes('n'),
    bottom: handle.includes('s'),
  };
}

/**
 * Ein gezogener oder gezeichneter Kasten, ausgerichtet: Jede Kante, die der Zug
 * bewegt, rastet für sich ein — die gegenüberliegende bleibt, wo sie ist. Beim
 * Zeichnen (`handle` null) bewegt der Zug alle vier: Ein aufgezogener Kasten hat
 * keine feste Seite, beide Ecken dürfen sich anlegen.
 *
 * Kleiner als `MIN_BLOCK_SIZE` wird dabei nichts: Eine Linie jenseits der
 * gegenüberliegenden Kante ließe den Kasten umklappen — sie kommt gar nicht erst
 * in Frage.
 */
export function snapSized(rect: Rect, handle: Handle | null, lines: Lines, range = SNAP_RANGE): Snap {
  const edges = edgesOf(handle);
  const guides: Guide[] = [];
  let { x, y, w, h } = rect;

  if (edges.left) {
    const at = edgeTo(x, lines.x, range, 0, round(x + w - MIN_BLOCK_SIZE));
    if (at !== null) {
      w = round(x + w - at);
      x = at;
      guides.push({ axis: 'x', at });
    }
  }
  if (edges.right) {
    const at = edgeTo(x + w, lines.x, range, round(x + MIN_BLOCK_SIZE), 1);
    if (at !== null) {
      w = round(at - x);
      guides.push({ axis: 'x', at });
    }
  }
  if (edges.top) {
    const at = edgeTo(y, lines.y, range, 0, round(y + h - MIN_BLOCK_SIZE));
    if (at !== null) {
      h = round(y + h - at);
      y = at;
      guides.push({ axis: 'y', at });
    }
  }
  if (edges.bottom) {
    const at = edgeTo(y + h, lines.y, range, round(y + MIN_BLOCK_SIZE), 1);
    if (at !== null) {
      h = round(at - y);
      guides.push({ axis: 'y', at });
    }
  }

  return { rect: { x: round(x), y: round(y), w: round(w), h: round(h) }, guides };
}
