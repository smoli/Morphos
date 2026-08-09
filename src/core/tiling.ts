/**
 * Der Kachel-Baum des Kachel-Modus — Hyprlands „dwindle“ nachempfunden.
 *
 * Die Fläche ist ein binärer Teilungsbaum: Blätter sind Fenster, innere Knoten
 * sind Teilungen mit einer Richtung (nebeneinander/übereinander) und einem
 * Verhältnis. Ein neues Fenster teilt die Kachel mit dem Brennpunkt, und zwar
 * quer zu ihrer längeren Seite; wird ein Fenster geschlossen, erbt seine
 * Schwester den Platz der Teilung. Daraus fällt für jedes Fenster genau ein
 * Rechteck ab — überschneidungsfrei, mit einer Fuge dazwischen.
 *
 * Hier steckt nur Rechnung: keine Vue-, keine DOM-Kenntnis. Die Oberfläche
 * (c0066/c0067) treibt diese Funktionen an, die Bäume sind schlichte Objekte
 * und damit auch speicherbar (c0068). Jede Änderung liefert einen neuen Baum;
 * ändert sich nichts, kommt der alte unverändert zurück.
 */

/** Nebeneinander (links/rechts) oder übereinander (oben/unten) — wie bei Flex. */
export type Orientation = 'row' | 'column';

/** Die beiden Kinder einer Teilung: `a` liegt links bzw. oben. */
export type Side = 'a' | 'b';

/** Weg von der Wurzel zu einem Knoten — der leere Pfad ist die Wurzel selbst. */
export type NodePath = readonly Side[];

/** Ein Blatt trägt ein Fenster, ein Knoten teilt seine Fläche in zwei. */
export type TileTree =
  | { kind: 'leaf'; id: string }
  | { kind: 'split'; orientation: Orientation; ratio: number; a: TileTree; b: TileTree };

/** Ein Rechteck in Bildpunkten, relativ zur Desktop-Fläche. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ein Punkt in derselben Rechnung — etwa die Zeigerposition beim Ziehen. */
export interface Point {
  x: number;
  y: number;
}

/** Die Fuge zwischen zwei Kacheln; sie ist zugleich der Griff zum Ziehen. */
export const DEFAULT_GAP = 12;

/** So schmal darf eine Kachel beim Ziehen an der Fuge höchstens werden. */
export const MIN_TILE = 96;

/** Eine getroffene Fuge: welche Teilung, in welcher Richtung, und wo sie liegt. */
export interface GapHit {
  path: NodePath;
  orientation: Orientation;
  band: Rect;
}

/** Ein Blatt für ein Fenster. */
export function leaf(id: string): TileTree {
  return { kind: 'leaf', id };
}

/** Eine Teilung zweier Äste; ohne Angabe halbiert sie. */
export function split(orientation: Orientation, a: TileTree, b: TileTree, ratio = 0.5): TileTree {
  return { kind: 'split', orientation, ratio, a, b };
}

/** Die Fenster des Baums, von links oben nach rechts unten. */
export function leafIds(tree: TileTree | null): string[] {
  if (!tree) return [];
  if (tree.kind === 'leaf') return [tree.id];
  return [...leafIds(tree.a), ...leafIds(tree.b)];
}

/** Steckt dieses Fenster schon im Baum? */
export function hasLeaf(tree: TileTree | null, id: string): boolean {
  if (!tree) return false;
  if (tree.kind === 'leaf') return tree.id === id;
  return hasLeaf(tree.a, id) || hasLeaf(tree.b, id);
}

/**
 * Das Rechteck jedes Fensters. Die Fuge zehrt von der Fläche, nicht von den
 * Kacheln: die beiden Hälften teilen sich, was nach Abzug der Fuge bleibt, und
 * füllen die Fläche danach genau aus — daher überschneidet sich nichts.
 */
export function computeRects(tree: TileTree | null, area: Rect, gap: number): Record<string, Rect> {
  const rects: Record<string, Rect> = {};
  walk(tree, area, gap, (id, rect) => {
    rects[id] = rect;
  });
  return rects;
}

function walk(
  tree: TileTree | null,
  area: Rect,
  gap: number,
  visit: (id: string, rect: Rect) => void,
): void {
  if (!tree) return;
  if (tree.kind === 'leaf') {
    visit(tree.id, area);
    return;
  }
  const [a, b] = childAreas(tree, area, gap);
  walk(tree.a, a, gap, visit);
  walk(tree.b, b, gap, visit);
}

/** Die Flächen der beiden Kinder einer Teilung. */
function childAreas(node: Extract<TileTree, { kind: 'split' }>, area: Rect, gap: number): [Rect, Rect] {
  const g = Math.max(0, Math.round(gap));
  const row = node.orientation === 'row';
  const size = row ? area.w : area.h;
  const avail = Math.max(0, size - g);
  const first = Math.min(avail, Math.max(0, Math.round(avail * safeRatio(node.ratio))));
  // Bei einer Fläche, die nicht einmal die Fuge fasst, bleibt für b nichts übrig.
  const offset = Math.min(first + g, Math.max(0, size));
  const second = Math.max(0, avail - first);
  if (row) {
    return [
      { x: area.x, y: area.y, w: first, h: area.h },
      { x: area.x + offset, y: area.y, w: second, h: area.h },
    ];
  }
  return [
    { x: area.x, y: area.y, w: area.w, h: first },
    { x: area.x, y: area.y + offset, w: area.w, h: second },
  ];
}

function safeRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Ein Fenster aufnehmen: es teilt die Kachel mit dem Brennpunkt — quer zu deren
 * längerer Seite (breiter → links/rechts, höher → oben/unten) — und legt sich
 * rechts bzw. unten hinein. Ohne bekannten Brennpunkt trifft es die zuletzt
 * entstandene Kachel (die ganz rechts unten).
 */
export function insertLeaf(
  tree: TileTree | null,
  focusId: string | null,
  id: string,
  area: Rect,
  gap: number,
): TileTree {
  if (!tree) return leaf(id);
  if (hasLeaf(tree, id)) return tree;

  const rects = computeRects(tree, area, gap);
  const target = focusId && rects[focusId] ? focusId : lastLeafId(tree);
  const rect = rects[target] ?? area;
  const orientation: Orientation = rect.w >= rect.h ? 'row' : 'column';
  return replaceLeaf(tree, target, split(orientation, leaf(target), leaf(id)));
}

/** Die Kachel ganz rechts unten — der Weg führt immer in den zweiten Ast. */
function lastLeafId(tree: TileTree): string {
  return tree.kind === 'leaf' ? tree.id : lastLeafId(tree.b);
}

function replaceLeaf(tree: TileTree, id: string, replacement: TileTree): TileTree {
  if (tree.kind === 'leaf') return tree.id === id ? replacement : tree;
  const a = replaceLeaf(tree.a, id, replacement);
  const b = replaceLeaf(tree.b, id, replacement);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

/**
 * Ein Fenster abräumen: seine Teilung fällt weg, die Schwester erbt deren
 * Platz. Das letzte Fenster lässt einen leeren Baum zurück.
 */
export function removeLeaf(tree: TileTree | null, id: string): TileTree | null {
  if (!tree) return null;
  if (tree.kind === 'leaf') return tree.id === id ? null : tree;
  const a = removeLeaf(tree.a, id);
  const b = removeLeaf(tree.b, id);
  if (a === tree.a && b === tree.b) return tree;
  if (!a) return b;
  if (!b) return a;
  return { ...tree, a, b };
}

/** Zwei Fenster tauschen die Plätze; fehlt eines, bleibt alles, wie es war. */
export function swapLeaves(tree: TileTree | null, first: string, second: string): TileTree | null {
  if (!tree || first === second) return tree;
  if (!hasLeaf(tree, first) || !hasLeaf(tree, second)) return tree;
  return swap(tree, first, second);
}

function swap(tree: TileTree, first: string, second: string): TileTree {
  if (tree.kind === 'leaf') {
    if (tree.id === first) return leaf(second);
    if (tree.id === second) return leaf(first);
    return tree;
  }
  const a = swap(tree.a, first, second);
  const b = swap(tree.b, first, second);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

/** Der Knoten am Ende eines Pfades — `null`, wenn der Pfad ins Leere führt. */
export function nodeAt(tree: TileTree | null, path: NodePath): TileTree | null {
  let node: TileTree | null = tree;
  for (const side of path) {
    if (!node || node.kind !== 'split') return null;
    node = node[side];
  }
  return node;
}

/** Die Fläche, die einem Knoten zusteht — `null`, wenn der Pfad ins Leere führt. */
export function nodeArea(tree: TileTree | null, path: NodePath, area: Rect, gap: number): Rect | null {
  let node: TileTree | null = tree;
  let rect = area;
  for (const side of path) {
    if (!node || node.kind !== 'split') return null;
    const [a, b] = childAreas(node, rect, gap);
    rect = side === 'a' ? a : b;
    node = node[side];
  }
  return node ? rect : null;
}

/**
 * Das Verhältnis einer Teilung setzen — begrenzt, damit keine der beiden
 * Kacheln unter die Mindestgröße rutscht; ist dafür ohnehin kein Platz, bleibt
 * es bei der Hälfte. Die Nachkommen ergeben sich anschließend von selbst.
 */
export function setRatio(
  tree: TileTree | null,
  path: NodePath,
  ratio: number,
  area: Rect,
  gap: number,
  min = MIN_TILE,
): TileTree | null {
  const node = nodeAt(tree, path);
  if (!tree || !node || node.kind !== 'split') return tree;
  const own = nodeArea(tree, path, area, gap) ?? area;
  const next = clampRatio(ratio, node.orientation === 'row' ? own.w : own.h, gap, min);
  if (next === node.ratio) return tree;
  return withNode(tree, path, { ...node, ratio: next });
}

/** Das Verhältnis, das die Mindestgröße auf beiden Seiten noch zulässt. */
export function clampRatio(ratio: number, size: number, gap: number, min = MIN_TILE): number {
  const avail = Math.max(0, size - Math.max(0, gap));
  const floor = Math.max(0, min);
  if (avail <= 0 || 2 * floor >= avail) return 0.5;
  const low = floor / avail;
  return Math.min(1 - low, Math.max(low, safeRatio(ratio)));
}

function withNode(tree: TileTree, path: NodePath, node: TileTree): TileTree {
  if (path.length === 0) return node;
  if (tree.kind !== 'split') return tree;
  const [side, ...rest] = path;
  return { ...tree, [side]: withNode(tree[side], rest, node) };
}

/**
 * Welche Fuge liegt unter diesem Punkt? Geprüft wird von außen nach innen: die
 * Fuge einer Teilung liegt zwischen deren Kindern, die inneren Fugen also
 * jeweils innerhalb eines Kindes. `tolerance` verbreitert den Griff, damit man
 * die Fuge auch knapp daneben noch fasst.
 */
export function hitGap(
  tree: TileTree | null,
  point: Point,
  area: Rect,
  gap: number,
  tolerance = 0,
): GapHit | null {
  return findGap(tree, point, area, gap, Math.max(0, tolerance), []);
}

function findGap(
  tree: TileTree | null,
  point: Point,
  area: Rect,
  gap: number,
  tolerance: number,
  path: Side[],
): GapHit | null {
  if (!tree || tree.kind !== 'split') return null;
  const [a, b] = childAreas(tree, area, gap);
  const band = gapBand(tree.orientation, a, b, area);
  if (contains(grow(band, tree.orientation, tolerance), point)) {
    return { path, orientation: tree.orientation, band };
  }
  if (contains(a, point)) return findGap(tree.a, point, a, gap, tolerance, [...path, 'a']);
  if (contains(b, point)) return findGap(tree.b, point, b, gap, tolerance, [...path, 'b']);
  return null;
}

/** Der Streifen zwischen den beiden Hälften einer Teilung. */
function gapBand(orientation: Orientation, a: Rect, b: Rect, area: Rect): Rect {
  if (orientation === 'row') {
    const x = a.x + a.w;
    return { x, y: area.y, w: Math.max(0, b.x - x), h: area.h };
  }
  const y = a.y + a.h;
  return { x: area.x, y, w: area.w, h: Math.max(0, b.y - y) };
}

function grow(rect: Rect, orientation: Orientation, by: number): Rect {
  if (by <= 0) return rect;
  if (orientation === 'row') return { ...rect, x: rect.x - by, w: rect.w + 2 * by };
  return { ...rect, y: rect.y - by, h: rect.h + 2 * by };
}

function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
  );
}

/**
 * Alle Fugen des Baums — je Teilung eine, von außen nach innen. `hitGap` sucht
 * die eine unter dem Zeiger; hier kommen sie alle, damit die Oberfläche für
 * jede einen Griff hinlegen kann (c0067).
 */
export function gapBands(tree: TileTree | null, area: Rect, gap: number): GapHit[] {
  const bands: GapHit[] = [];
  collectGaps(tree, area, gap, [], bands);
  return bands;
}

function collectGaps(
  tree: TileTree | null,
  area: Rect,
  gap: number,
  path: Side[],
  out: GapHit[],
): void {
  if (!tree || tree.kind !== 'split') return;
  const [a, b] = childAreas(tree, area, gap);
  out.push({ path, orientation: tree.orientation, band: gapBand(tree.orientation, a, b, area) });
  collectGaps(tree.a, a, gap, [...path, 'a'], out);
  collectGaps(tree.b, b, gap, [...path, 'b'], out);
}

/**
 * Welches Fenster liegt unter diesem Punkt? Für das Tauschen zweier Kacheln
 * (c0067): Auf der Fuge und außerhalb der Fläche liegt keines.
 */
export function hitLeaf(
  tree: TileTree | null,
  point: Point,
  area: Rect,
  gap: number,
): string | null {
  if (!tree) return null;
  if (tree.kind === 'leaf') return contains(area, point) ? tree.id : null;
  const [a, b] = childAreas(tree, area, gap);
  return hitLeaf(tree.a, point, a, gap) ?? hitLeaf(tree.b, point, b, gap);
}

/**
 * Das Verhältnis, das eine an die Fuge gezogene Zeigerposition meint — die
 * Fuge sitzt mittig unter dem Zeiger. Bereits begrenzt wie `setRatio`.
 */
export function ratioAtPoint(
  tree: TileTree | null,
  path: NodePath,
  point: Point,
  area: Rect,
  gap: number,
  min = MIN_TILE,
): number {
  const node = nodeAt(tree, path);
  if (!node || node.kind !== 'split') return 0.5;
  const own = nodeArea(tree, path, area, gap) ?? area;
  const g = Math.max(0, Math.round(gap));
  const row = node.orientation === 'row';
  const size = row ? own.w : own.h;
  const start = row ? own.x : own.y;
  const avail = Math.max(1, size - g);
  return clampRatio(((row ? point.x : point.y) - start - g / 2) / avail, size, g, min);
}
