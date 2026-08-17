/**
 * Der UI-Entwurf einer App (e15): ein Baum aus Blöcken, den der Anwender über
 * der laufenden App zeichnet, und an den sich der Agent beim Bauen hält.
 *
 *   <app>/design.ui.json   der Entwurf — im Wurzelverzeichnis der App, neben
 *                          concept.md, also NICHT unter src/
 *
 * Dieses Modul ist das reine MODELL: Typen, Zurechtrücken und die Baum-Helfer,
 * ohne einen Griff zur Platte. Gelesen und geschrieben wird in core/designstore
 * (nur Hauptprozess). Die Trennung ist keine Kür — seit c0107 zeichnet der
 * Renderer selbst, braucht also `addBlock` und Genossen als echte Werte, und
 * dürfte doch niemals node:fs ins Bündel ziehen.
 *
 * Der Ort ist Absicht und zugleich die Grenze: Der Agent darf ausschließlich
 * unter src/ und in die beiden Dokumente schreiben (core/files), der Entwurf
 * liegt außerhalb — er ist für den Agenten Nur-Lesen. Geschrieben wird er
 * allein von der Schale (dem Designer-Overlay). Weil auch das Bündeln nur src/
 * anfasst, landet die Datei nicht im Artefakt.
 *
 * Ein Block ist ein benannter Kasten mit optionalen Anweisungen und einer
 * optionalen Rolle (`type`), dazu seine Geometrie und seine Kinder. Die
 * Geometrie ist bewusst KEINE Pixelangabe, sondern ein Anteil des App-Fensters
 * (0…1 in beiden Richtungen): Ein Entwurf soll eine Größenänderung des Fensters
 * überleben und in jeder Kachel dasselbe bedeuten. Die Anteile sind absolut —
 * auch die eines Kindes beziehen sich auf das Fenster, nicht auf seinen Elter.
 * Das Verschachteln ist damit eine reine Aussage über die Gliederung; ein
 * Umhängen verschiebt nichts.
 *
 * Alles hier ist rein und ohne Zustand: Die Baum-Helfer geben stets einen neuen
 * Entwurf zurück und lassen den übergebenen unangetastet. Was von der Platte
 * kommt, geht durch `normalizeDesign` — eine fremde oder halb geschriebene
 * Datei wird zu einem heilen Baum, nie zu einem Fehler.
 */

/** Die Lage eines Blocks im App-Fenster — Anteile von 0 bis 1. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ein Kasten im Entwurf. */
export interface Block {
  /** Eindeutig im ganzen Entwurf. */
  id: string;
  name: string;
  /** Was in diesem Kasten geschehen soll — geht so in den Prompt. */
  instructions?: string;
  /** Rollenhinweis („header“, „liste“, …) — frei wählbar. */
  type?: string;
  rect: Rect;
  children: Block[];
}

/** Der Entwurf einer App: der Baum plus die Fassung des Schemas. */
export interface Design {
  version: number;
  blocks: Block[];
}

/**
 * Die Kanten und Ecken, an denen sich ein Kasten anfassen und größer ziehen
 * lässt (c0109) — benannt nach der Himmelsrichtung: `nw` ist die linke obere
 * Ecke, `s` die untere Kante.
 */
export type Handle = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'se' | 'sw';

/** Alle acht Griffe, im Uhrzeigersinn ab der linken oberen Ecke. */
export const BLOCK_HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Der Entwurf liegt im Wurzelverzeichnis der App, neben concept.md. */
export const DESIGN_FILE = 'design.ui.json';

/** Die Fassung des Schemas, in der neu geschrieben wird. */
export const DESIGN_VERSION = 1;

/** So tief darf ein Entwurf geschachtelt sein — was tiefer liegt, fällt weg. */
export const MAX_DESIGN_DEPTH = 16;

/** Kleiner darf kein Block werden — sonst ließe er sich nicht mehr greifen. */
export const MIN_BLOCK_SIZE = 0.01;

/**
 * Wie ein frisch gezeichneter Kasten heißt, solange ihm niemand einen Namen
 * gegeben hat. Er steht so im Prompt — lieber ein sichtbarer Platzhalter als
 * ein namenloser Kasten, den der Agent nicht deuten kann.
 */
export const DEFAULT_BLOCK_NAME = 'Neuer Block';

/** Obergrenzen für die Texte eines Blocks (sie gehen in jeden Prompt). */
export const MAX_NAME_LENGTH = 120;
export const MAX_TYPE_LENGTH = 60;
export const MAX_INSTRUCTIONS_LENGTH = 4000;

/**
 * Rollen, die zur Wahl stehen (c0108). Die Rolle ist und bleibt freier Text —
 * das hier ist nur der Vorrat, aus dem sich das Feld bedienen lässt: Wer eine
 * andere Rolle meint, schreibt sie hin. Der Nutzen der Liste ist die
 * Gleichförmigkeit — „Kopfzeile“ zweimal gleich geschrieben liest der Agent
 * auch als dasselbe.
 */
export const BLOCK_ROLES = [
  'Kopfzeile',
  'Navigation',
  'Seitenleiste',
  'Inhalt',
  'Liste',
  'Formular',
  'Schaltfläche',
  'Fußzeile',
] as const;

/** Noch kein Entwurf (jeder Aufruf liefert einen eigenen). */
export function emptyDesign(): Design {
  return { version: DESIGN_VERSION, blocks: [] };
}

/** Eine neue Block-Id (vgl. core/app: makeAppId). */
export function makeBlockId(): string {
  return `b${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/* Prüfen und Zurechtrücken                                            */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Eine gelesene Zahl — was keine ist, wird zum Vorgabewert. */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Anteile auf vier Nachkommastellen — feiner als ein Pixel auf einem breiten
 * Schirm und ohne den Rechenstaub des Fließkommas. So steht in der Datei 0.2
 * und nicht 0.19999999999999996, und ein Zug, der nichts verschiebt, macht
 * auch keinen Git-Diff.
 */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Eine gelesene Geometrie: Anteile im Fenster, nie kleiner als
 * `MIN_BLOCK_SIZE` und nie über den Rand hinaus.
 */
export function clampRect(raw: unknown, base: Rect = { x: 0, y: 0, w: MIN_BLOCK_SIZE, h: MIN_BLOCK_SIZE }): Rect {
  const r = (raw ?? {}) as Partial<Record<keyof Rect, unknown>>;
  const x = round(clamp(num(r.x, base.x), 0, 1 - MIN_BLOCK_SIZE));
  const y = round(clamp(num(r.y, base.y), 0, 1 - MIN_BLOCK_SIZE));
  return {
    x,
    y,
    w: round(clamp(num(r.w, base.w), MIN_BLOCK_SIZE, round(1 - x))),
    h: round(clamp(num(r.h, base.h), MIN_BLOCK_SIZE, round(1 - y))),
  };
}

/**
 * Verschiebt eine Fläche um (dx, dy) — ihre Größe bleibt, wie sie ist. Am Rand
 * des Fensters ist Schluss: Der Kasten bleibt stehen, statt schmaler zu werden
 * (das ist der Unterschied zu `clampRect`, das eine gelesene Geometrie
 * zurechtrückt, ohne einen Zug zu kennen).
 *
 * `bounds` ist die Fläche, die dabei im Fenster bleiben muss — beim Schieben
 * eines Kastens mit Kindern ist das nicht er selbst, sondern was sein ganzer
 * Zweig einnimmt (`blockBounds`). Ohne Angabe ist es der Kasten selbst.
 */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Rect = rect): Rect {
  const ax = clamp(num(dx, 0), -bounds.x, round(1 - (bounds.x + bounds.w)));
  const ay = clamp(num(dy, 0), -bounds.y, round(1 - (bounds.y + bounds.h)));
  return { ...rect, x: round(rect.x + ax), y: round(rect.y + ay) };
}

/**
 * Die Fläche, die entsteht, wenn ein Kasten an einem seiner Griffe um (dx, dy)
 * gezogen wird: Die angefasste Kante wandert, die gegenüberliegende bleibt
 * stehen. Über sie hinaus geht es nicht — ein Kasten klappt nicht um, sondern
 * bleibt bei `MIN_BLOCK_SIZE` stehen; über den Rand des Fensters ebenso wenig.
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number): Rect {
  const ax = num(dx, 0);
  const ay = num(dy, 0);
  let { x, y, w, h } = rect;
  if (handle.includes('w')) {
    const right = x + w;
    x = clamp(x + ax, 0, round(right - MIN_BLOCK_SIZE));
    w = right - x;
  } else if (handle.includes('e')) {
    w = clamp(w + ax, MIN_BLOCK_SIZE, round(1 - x));
  }
  if (handle.includes('n')) {
    const bottom = y + h;
    y = clamp(y + ay, 0, round(bottom - MIN_BLOCK_SIZE));
    h = bottom - y;
  } else if (handle.includes('s')) {
    h = clamp(h + ay, MIN_BLOCK_SIZE, round(1 - y));
  }
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

/** Ein gelesener Text: beschnitten und gekappt, alles andere wird leer. */
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Ein gelesener Block. Was fehlt, wird ergänzt; was nicht taugt, wird ersetzt;
 * eine schon vergebene Id bekommt eine neue, damit jeder Block im Entwurf
 * eindeutig bleibt (sonst fände `findBlock` den falschen). `null` heißt: das
 * war gar kein Block.
 */
function readBlock(raw: unknown, depth: number, seen: Set<string>): Block | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;

  let id = text(b.id, 100);
  if (!id || seen.has(id)) {
    do {
      id = makeBlockId();
    } while (seen.has(id));
  }
  seen.add(id);

  const instructions = text(b.instructions, MAX_INSTRUCTIONS_LENGTH);
  const type = text(b.type, MAX_TYPE_LENGTH);
  const children =
    depth + 1 < MAX_DESIGN_DEPTH && Array.isArray(b.children)
      ? b.children.map((c) => readBlock(c, depth + 1, seen)).filter((c): c is Block => c !== null)
      : [];

  return {
    id,
    name: text(b.name, MAX_NAME_LENGTH),
    ...(instructions ? { instructions } : {}),
    ...(type ? { type } : {}),
    rect: clampRect(b.rect),
    children,
  };
}

/**
 * Nimmt (fremde) Eingaben als Entwurf entgegen: eine halb geschriebene, von
 * Hand verbogene oder aus einer anderen Fassung stammende Datei wird zu einem
 * heilen Baum. Eine gültige Fassungsnummer bleibt erhalten (ein neuerer Stand
 * soll beim Lesen nicht verlorengehen).
 */
export function normalizeDesign(raw: unknown): Design {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDesign();
  const d = raw as Record<string, unknown>;
  const version = d.version;
  const seen = new Set<string>();
  return {
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : DESIGN_VERSION,
    blocks: Array.isArray(d.blocks)
      ? d.blocks.map((b) => readBlock(b, 0, seen)).filter((b): b is Block => b !== null)
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* Baum-Helfer (rein)                                                  */
/* ------------------------------------------------------------------ */

/** Läuft den Baum in Lesereihenfolge ab — mit Elter (null an der Wurzel) und Tiefe. */
export function walkBlocks(
  design: Design,
  visit: (block: Block, parent: Block | null, depth: number) => void,
): void {
  const step = (blocks: readonly Block[], parent: Block | null, depth: number): void => {
    for (const b of blocks) {
      visit(b, parent, depth);
      step(b.children, b, depth + 1);
    }
  };
  step(design.blocks, null, 0);
}

/** Alle Blöcke des Entwurfs in Lesereihenfolge. */
export function listBlocks(design: Design): Block[] {
  const all: Block[] = [];
  walkBlocks(design, (b) => all.push(b));
  return all;
}

/**
 * Der Block zu einer Id in einer Kästenliste — null, wenn es ihn nicht (mehr)
 * gibt. Für alle, die den Baum haben, aber nicht den ganzen Entwurf (die
 * Zeichenfläche etwa bekommt nur die Kästen gereicht).
 */
export function findBlockIn(blocks: readonly Block[], id: string): Block | null {
  if (!id) return null;
  for (const b of blocks) {
    if (b.id === id) return b;
    const found = findBlockIn(b.children, id);
    if (found) return found;
  }
  return null;
}

/** Der Block zu einer Id — null, wenn es ihn nicht (mehr) gibt. */
export function findBlock(design: Design, id: string): Block | null {
  return findBlockIn(design.blocks, id);
}

/**
 * Die kleinste Fläche, die einen Kasten SAMT seiner Kinder umschließt. Ein Kind
 * darf über seinen Elter hinausragen (die Anteile sind absolut, c0104) — wer
 * einen Kasten schiebt, schiebt aber den ganzen Zweig, und der soll im Fenster
 * bleiben.
 */
export function blockBounds(block: Block): Rect {
  let left = block.rect.x;
  let top = block.rect.y;
  let right = left + block.rect.w;
  let bottom = top + block.rect.h;
  const step = (b: Block): void => {
    left = Math.min(left, b.rect.x);
    top = Math.min(top, b.rect.y);
    right = Math.max(right, b.rect.x + b.rect.w);
    bottom = Math.max(bottom, b.rect.y + b.rect.h);
    b.children.forEach(step);
  };
  block.children.forEach(step);
  return { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) };
}

/** Ein Block und alles unter ihm (für die Kreisprüfung beim Umhängen). */
function subtreeIds(block: Block): Set<string> {
  const ids = new Set<string>();
  const step = (b: Block): void => {
    ids.add(b.id);
    b.children.forEach(step);
  };
  step(block);
  return ids;
}

/**
 * Baut den Baum neu und ersetzt dabei die Kinderliste eines Knotens: Der
 * gemeinsame Weg aller Helfer — jeder gibt einen neuen Entwurf zurück, der
 * übergebene bleibt unangetastet. `parentId` null meint die Wurzel.
 */
function withChildren(
  design: Design,
  parentId: string | null,
  change: (children: readonly Block[]) => Block[],
): Design {
  const step = (blocks: readonly Block[]): Block[] =>
    blocks.map((b) => (b.id === parentId ? { ...b, children: change(b.children) } : { ...b, children: step(b.children) }));
  return parentId === null
    ? { ...design, blocks: change(design.blocks) }
    : { ...design, blocks: step(design.blocks) };
}

/** Denselben Block ersetzen, überall im Baum. */
function withBlock(design: Design, id: string, change: (block: Block) => Block): Design {
  const step = (blocks: readonly Block[]): Block[] =>
    blocks.map((b) => (b.id === id ? change(b) : { ...b, children: step(b.children) }));
  return { ...design, blocks: step(design.blocks) };
}

/**
 * Hängt einen neuen Block an (an die Wurzel oder unter `parentId`). Der Block
 * wird zurechtgerückt; eine belegte Id oder ein unbekannter Elter lassen den
 * Entwurf unverändert — so kann ein Zeichenzug nichts zerstören.
 */
export function addBlock(design: Design, block: Block, parentId: string | null = null): Design {
  if (findBlock(design, block.id)) return design;
  if (parentId !== null && !findBlock(design, parentId)) return design;
  const seen = new Set(listBlocks(design).map((b) => b.id));
  const clean = readBlock(block, 0, seen);
  if (!clean) return design;
  return withChildren(design, parentId, (children) => [...children, clean]);
}

/** Entfernt einen Block samt seiner Kinder. Unbekannte Id: nichts ändert sich. */
export function removeBlock(design: Design, id: string): Design {
  if (!findBlock(design, id)) return design;
  const step = (blocks: readonly Block[]): Block[] =>
    blocks.filter((b) => b.id !== id).map((b) => ({ ...b, children: step(b.children) }));
  return { ...design, blocks: step(design.blocks) };
}

/**
 * Verschiebt bzw. verändert die Größe eines Blocks. Übergeben wird, was sich
 * ändert; der Rest bleibt stehen. Die neue Lage wird zurechtgerückt.
 */
export function moveBlock(design: Design, id: string, rect: Partial<Rect>): Design {
  const block = findBlock(design, id);
  if (!block) return design;
  return withBlock(design, id, (b) => ({ ...b, rect: clampRect({ ...b.rect, ...rect }, b.rect) }));
}

/**
 * Schiebt einen Block an eine neue Stelle — samt seiner Kinder (c0109). Seine
 * Größe bleibt dabei, wie sie war, und am Rand des Fensters ist Schluss.
 *
 * Anders als `moveBlock`, das eine Geometrie schlicht setzt (und darum beim
 * Ziehen an einer Kante die richtige Wahl ist), ist Schieben eine Aussage über
 * den ganzen Zweig: Die Anteile eines Kindes beziehen sich aufs Fenster
 * (c0104), also müssen sie mitwandern — sonst rutschte das Kind aus seinem
 * Elter, und der Baum sagte etwas anderes als das Bild.
 */
export function placeBlock(design: Design, id: string, x: number, y: number): Design {
  const block = findBlock(design, id);
  if (!block) return design;
  const moved = moveRect(
    block.rect,
    num(x, block.rect.x) - block.rect.x,
    num(y, block.rect.y) - block.rect.y,
    blockBounds(block),
  );
  const dx = moved.x - block.rect.x;
  const dy = moved.y - block.rect.y;
  const shift = (b: Block): Block => ({
    ...b,
    rect: { ...b.rect, x: round(b.rect.x + dx), y: round(b.rect.y + dy) },
    children: b.children.map(shift),
  });
  return withBlock(design, id, shift);
}

/**
 * Ändert Name, Anweisungen oder Rolle eines Blocks. Nicht genannte Felder
 * bleiben, leerer Text löscht das jeweilige Feld.
 */
export function updateBlock(
  design: Design,
  id: string,
  patch: { name?: string; instructions?: string; type?: string },
): Design {
  if (!findBlock(design, id)) return design;
  return withBlock(design, id, (b) => {
    const next: Block = { ...b };
    if (patch.name !== undefined) next.name = text(patch.name, MAX_NAME_LENGTH);
    if (patch.instructions !== undefined) {
      const value = text(patch.instructions, MAX_INSTRUCTIONS_LENGTH);
      if (value) next.instructions = value;
      else delete next.instructions;
    }
    if (patch.type !== undefined) {
      const value = text(patch.type, MAX_TYPE_LENGTH);
      if (value) next.type = value;
      else delete next.type;
    }
    return next;
  });
}

/**
 * Hängt einen Block (samt seiner Kinder) unter einen anderen — `parentId` null
 * hebt ihn an die Wurzel. `index` bestimmt den Platz unter den Geschwistern
 * (ohne Angabe: ans Ende). Ein Block wird dabei nie sein eigener Nachfahre:
 * Ein solcher Zug lässt den Entwurf unverändert, ebenso eine unbekannte Id.
 */
export function reparentBlock(design: Design, id: string, parentId: string | null, index?: number): Design {
  const block = findBlock(design, id);
  if (!block) return design;
  if (parentId !== null) {
    const parent = findBlock(design, parentId);
    if (!parent || subtreeIds(block).has(parentId)) return design;
  }
  const detached = removeBlock(design, id);
  return withChildren(detached, parentId, (children) => {
    const at = index === undefined ? children.length : clamp(Math.trunc(index), 0, children.length);
    return [...children.slice(0, at), block, ...children.slice(at)];
  });
}
