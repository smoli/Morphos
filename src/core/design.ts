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
 * Ein Entwurf besteht aus ANSICHTEN (c0113): Eine App hat selten nur einen
 * Bildschirm — Liste und Detail, Anmeldung und Arbeitsfläche, Einstellungen.
 * Jede Ansicht hat ihren Titel, ihre (freiwillige) Beschreibung und ihren
 * eigenen Baum aus Kästen; die Anteile gelten je Ansicht für dasselbe Fenster,
 * denn zu sehen ist stets eine von ihnen. Ein Entwurf aus der Zeit davor hatte
 * seine Kästen unmittelbar am Entwurf (`blocks`) — `normalizeDesign` macht
 * daraus eine Ansicht, alte Dateien bleiben also lesbar.
 *
 * Die Baum-Helfer arbeiten darum an einer ANSICHT, nicht am ganzen Entwurf;
 * `inView` setzt eine solche Änderung in den Entwurf zurück. Das ist die Grenze
 * zwischen den beiden Ebenen: Was mit Kästen zu tun hat, kennt nur seine
 * Ansicht, und was mit Ansichten zu tun hat, rührt keine Kästen an.
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
 * Wohin ein Kasten GEHÖRT, sagt darum seine Lage (c0110): Sein Elter ist der
 * unterste Kasten, der ihn ganz umschließt (`containerIn`, `nestBlock`). Eine
 * Regel für beide Richtungen — hineingeschoben verschachtelt, hinausgeschoben
 * hängt um —, und so sagt der Baum nie etwas anderes als das Bild.
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

/**
 * Eine Ansicht: ein Bildschirm der App (c0113) — mit ihrem Titel, ihrer
 * freiwilligen Beschreibung und ihrem eigenen Baum aus Kästen.
 */
export interface View {
  /** Eindeutig im ganzen Entwurf. */
  id: string;
  /** Wie diese Ansicht heißt — sie hat immer einen Titel. */
  title: string;
  /** Wofür diese Ansicht da ist — geht so in den Prompt. */
  description?: string;
  blocks: Block[];
}

/** Der Entwurf einer App: ihre Ansichten plus die Fassung des Schemas. */
export interface Design {
  version: number;
  views: View[];
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
 * So viele Ansichten darf ein Entwurf haben (c0113) — was darüber steht, fällt
 * beim Lesen weg. Wie jede Grenze hier ist es eine des Prompts: Der ganze
 * Entwurf geht in jeden Lauf.
 */
export const MAX_VIEWS = 24;

/** Obergrenzen für die Texte einer Ansicht (sie gehen ebenfalls in jeden Prompt). */
export const MAX_VIEW_TITLE_LENGTH = 120;
export const MAX_VIEW_DESCRIPTION_LENGTH = 4000;

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
  return { version: DESIGN_VERSION, views: [] };
}

/** Eine neue Block-Id (vgl. core/app: makeAppId). */
export function makeBlockId(): string {
  return `b${Math.random().toString(36).slice(2, 9)}`;
}

/** Eine neue Ansicht-Id — am Buchstaben zu erkennen wie die eines Kastens. */
export function makeViewId(): string {
  return `v${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Wie die `count + 1`-te Ansicht heißt, solange ihr niemand einen Titel gegeben
 * hat. Eine Ansicht ohne Titel gibt es nicht: Sie steht als Überschrift im
 * Prompt, und „Ansicht 2“ sagt wenigstens, welche gemeint ist.
 */
export function viewTitleFor(count: number): string {
  return `Ansicht ${count + 1}`;
}

/** Eine neue, leere Ansicht (jeder Aufruf liefert eine eigene). */
export function emptyView(title = viewTitleFor(0)): View {
  return { id: makeViewId(), title, blocks: [] };
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
 * Eine gelesene Ansicht. Was fehlt, wird ergänzt; eine schon vergebene Id
 * bekommt eine neue. `blockIds` läuft über den GANZEN Entwurf: Zwei Ansichten
 * sollen sich keine Id teilen, sonst fände ein Zug in der einen den Kasten der
 * anderen. `null` heißt: das war gar keine Ansicht.
 */
function readView(raw: unknown, index: number, seen: Set<string>, blockIds: Set<string>): View | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;

  let id = text(v.id, 100);
  if (!id || seen.has(id)) {
    do {
      id = makeViewId();
    } while (seen.has(id));
  }
  seen.add(id);

  const description = text(v.description, MAX_VIEW_DESCRIPTION_LENGTH);

  return {
    id,
    title: text(v.title, MAX_VIEW_TITLE_LENGTH) || viewTitleFor(index),
    ...(description ? { description } : {}),
    blocks: Array.isArray(v.blocks)
      ? v.blocks.map((b) => readBlock(b, 0, blockIds)).filter((b): b is Block => b !== null)
      : [],
  };
}

/**
 * Nimmt (fremde) Eingaben als Entwurf entgegen: eine halb geschriebene, von
 * Hand verbogene oder aus einer anderen Fassung stammende Datei wird zu einem
 * heilen Baum. Eine gültige Fassungsnummer bleibt erhalten (ein neuerer Stand
 * soll beim Lesen nicht verlorengehen).
 *
 * Ein Entwurf aus der Zeit vor den Ansichten (c0113) trägt seine Kästen
 * unmittelbar an sich (`blocks`) — daraus wird eine Ansicht. Eine alte Datei
 * liest sich damit wie eh und je, nur eben als die eine Ansicht, die sie war.
 */
export function normalizeDesign(raw: unknown): Design {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDesign();
  const d = raw as Record<string, unknown>;
  const version = d.version;
  const rawViews = Array.isArray(d.views)
    ? d.views
    : Array.isArray(d.blocks)
      ? [{ blocks: d.blocks }]
      : [];

  const seen = new Set<string>();
  const blockIds = new Set<string>();
  const views: View[] = [];
  for (const raw of rawViews) {
    if (views.length >= MAX_VIEWS) break;
    const view = readView(raw, views.length, seen, blockIds);
    if (view) views.push(view);
  }

  return {
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : DESIGN_VERSION,
    views,
  };
}

/* ------------------------------------------------------------------ */
/* Ansichten (c0113)                                                   */
/* ------------------------------------------------------------------ */

/** Die Ansicht zu einer Id — null, wenn es sie nicht (mehr) gibt. */
export function findView(design: Design, id: string | null): View | null {
  if (!id) return null;
  return design.views.find((v) => v.id === id) ?? null;
}

/**
 * Sagt der Entwurf überhaupt etwas? Das tut er, sobald irgendeine Ansicht einen
 * Kasten hat oder beschrieben ist — beides geht in den Prompt und beides ist
 * Arbeit des Anwenders. Eine frisch angelegte, leere Ansicht zählt dagegen
 * nicht: „Ansicht 2“ ohne Inhalt ist ein Platzhalter, kein Entwurf.
 *
 * Daran hängt, ob eine `design.ui.json` überhaupt entsteht (c0112) und ob im
 * Prompt ein `UI-LAYOUT` steht (c0106).
 */
export function hasContent(design: Design): boolean {
  return design.views.some((v) => v.blocks.length > 0 || !!v.description);
}

/**
 * Hängt eine Ansicht an den Entwurf. Ohne Angabe entsteht eine leere mit dem
 * nächsten Titel („Ansicht 3“). Eine belegte Id oder die erreichte Obergrenze
 * lassen den Entwurf unverändert — wie bei den Kästen kann ein Griff daneben
 * nichts zerstören.
 */
export function addView(design: Design, view?: View): Design {
  if (design.views.length >= MAX_VIEWS) return design;
  const next = view ?? emptyView(viewTitleFor(design.views.length));
  if (findView(design, next.id)) return design;
  const clean = readView(next, design.views.length, new Set(design.views.map((v) => v.id)), allBlockIds(design));
  if (!clean) return design;
  return { ...design, views: [...design.views, clean] };
}

/** Entfernt eine Ansicht samt ihren Kästen. Unbekannte Id: nichts ändert sich. */
export function removeView(design: Design, id: string): Design {
  if (!findView(design, id)) return design;
  return { ...design, views: design.views.filter((v) => v.id !== id) };
}

/**
 * Ändert Titel oder Beschreibung einer Ansicht. Nicht genannte Felder bleiben,
 * leere Beschreibung nimmt das Feld weg — ein leerer Titel wird dagegen NICHT
 * übernommen: Eine Ansicht ohne Titel wäre im Prompt eine Überschrift ohne
 * Wort, also behält sie den alten.
 *
 * Ändert sich dabei nichts, kommt der übergebene Entwurf unverändert zurück —
 * so schreibt ein Feld, das man ohne Änderung verlässt, die Datei nicht neu.
 */
export function updateView(
  design: Design,
  id: string,
  patch: { title?: string; description?: string },
): Design {
  const view = findView(design, id);
  if (!view) return design;

  const next: View = { ...view };
  if (patch.title !== undefined) {
    const value = text(patch.title, MAX_VIEW_TITLE_LENGTH);
    if (value) next.title = value;
  }
  if (patch.description !== undefined) {
    const value = text(patch.description, MAX_VIEW_DESCRIPTION_LENGTH);
    if (value) next.description = value;
    else delete next.description;
  }
  if (next.title === view.title && next.description === view.description) return design;

  return { ...design, views: design.views.map((v) => (v.id === id ? next : v)) };
}

/**
 * Setzt eine Änderung an EINER Ansicht in den Entwurf zurück — die Brücke
 * zwischen den beiden Ebenen: Die Baum-Helfer (`addBlock` und Genossen) kennen
 * nur ihre Ansicht, geschrieben wird aber der ganze Entwurf.
 *
 * Eine unbekannte Id lässt den Entwurf unverändert, und ändert die Funktion
 * nichts, kommt der übergebene Entwurf unverändert zurück (das Vergleichen auf
 * Gleichheit im Store bleibt damit brauchbar).
 */
export function inView(design: Design, viewId: string | null, change: (view: View) => View): Design {
  const view = findView(design, viewId);
  if (!view) return design;
  const next = change(view);
  if (next === view) return design;
  return { ...design, views: design.views.map((v) => (v.id === view.id ? next : v)) };
}

/* ------------------------------------------------------------------ */
/* Baum-Helfer (rein) — sie arbeiten an EINER Ansicht                  */
/* ------------------------------------------------------------------ */

/** Läuft den Baum in Lesereihenfolge ab — mit Elter (null an der Wurzel) und Tiefe. */
export function walkBlocks(
  view: View,
  visit: (block: Block, parent: Block | null, depth: number) => void,
): void {
  const step = (blocks: readonly Block[], parent: Block | null, depth: number): void => {
    for (const b of blocks) {
      visit(b, parent, depth);
      step(b.children, b, depth + 1);
    }
  };
  step(view.blocks, null, 0);
}

/** Alle Blöcke einer Ansicht in Lesereihenfolge. */
export function listBlocks(view: View): Block[] {
  const all: Block[] = [];
  walkBlocks(view, (b) => all.push(b));
  return all;
}

/** Die Ids aller Kästen des ganzen Entwurfs — über alle Ansichten hinweg. */
function allBlockIds(design: Design): Set<string> {
  return new Set(design.views.flatMap((v) => listBlocks(v).map((b) => b.id)));
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

/** Der Block zu einer Id in einer Ansicht — null, wenn es ihn nicht (mehr) gibt. */
export function findBlock(view: View, id: string): Block | null {
  return findBlockIn(view.blocks, id);
}

/**
 * Der Weg zu einem Kasten: von der Wurzel bis zu ihm selbst, er steht zuletzt
 * (c0111). Was davor steht, sind seine Vorfahren — das Feld zeigt damit, WO ein
 * Kasten liegt, ohne den Baum ein zweites Mal ablaufen zu müssen.
 *
 * Einen Kasten, den es nicht gibt, gibt es auch nicht halb: Dann ist der Weg
 * leer. Die Kästen kommen unverändert aus dem Baum (keine Abzüge), also nennt
 * der Weg stets die Namen, die gerade in der Datei stehen.
 */
export function pathIn(blocks: readonly Block[], id: string): Block[] {
  if (!id) return [];
  for (const b of blocks) {
    if (b.id === id) return [b];
    const below = pathIn(b.children, id);
    if (below.length) return [b, ...below];
  }
  return [];
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
 * gemeinsame Weg aller Helfer — jeder gibt eine neue Ansicht zurück, die
 * übergebene bleibt unangetastet. `parentId` null meint die Wurzel.
 */
function withChildren(
  view: View,
  parentId: string | null,
  change: (children: readonly Block[]) => Block[],
): View {
  const step = (blocks: readonly Block[]): Block[] =>
    blocks.map((b) => (b.id === parentId ? { ...b, children: change(b.children) } : { ...b, children: step(b.children) }));
  return parentId === null
    ? { ...view, blocks: change(view.blocks) }
    : { ...view, blocks: step(view.blocks) };
}

/** Denselben Block ersetzen, überall im Baum. */
function withBlock(view: View, id: string, change: (block: Block) => Block): View {
  const step = (blocks: readonly Block[]): Block[] =>
    blocks.map((b) => (b.id === id ? change(b) : { ...b, children: step(b.children) }));
  return { ...view, blocks: step(view.blocks) };
}

/**
 * Hängt einen neuen Block an (an die Wurzel oder unter `parentId`). Der Block
 * wird zurechtgerückt; eine belegte Id oder ein unbekannter Elter lassen die
 * Ansicht unverändert — so kann ein Zeichenzug nichts zerstören.
 */
export function addBlock(view: View, block: Block, parentId: string | null = null): View {
  if (findBlock(view, block.id)) return view;
  if (parentId !== null && !findBlock(view, parentId)) return view;
  const seen = new Set(listBlocks(view).map((b) => b.id));
  const clean = readBlock(block, 0, seen);
  if (!clean) return view;
  return withChildren(view, parentId, (children) => [...children, clean]);
}

/** Entfernt einen Block samt seiner Kinder. Unbekannte Id: nichts ändert sich. */
export function removeBlock(view: View, id: string): View {
  if (!findBlock(view, id)) return view;
  const step = (blocks: readonly Block[]): Block[] =>
    blocks.filter((b) => b.id !== id).map((b) => ({ ...b, children: step(b.children) }));
  return { ...view, blocks: step(view.blocks) };
}

/**
 * Verschiebt bzw. verändert die Größe eines Blocks. Übergeben wird, was sich
 * ändert; der Rest bleibt stehen. Die neue Lage wird zurechtgerückt.
 */
export function moveBlock(view: View, id: string, rect: Partial<Rect>): View {
  const block = findBlock(view, id);
  if (!block) return view;
  return withBlock(view, id, (b) => ({ ...b, rect: clampRect({ ...b.rect, ...rect }, b.rect) }));
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
export function placeBlock(view: View, id: string, x: number, y: number): View {
  const block = findBlock(view, id);
  if (!block) return view;
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
  return withBlock(view, id, shift);
}

/**
 * Ändert Name, Anweisungen oder Rolle eines Blocks. Nicht genannte Felder
 * bleiben, leerer Text löscht das jeweilige Feld.
 */
export function updateBlock(
  view: View,
  id: string,
  patch: { name?: string; instructions?: string; type?: string },
): View {
  if (!findBlock(view, id)) return view;
  return withBlock(view, id, (b) => {
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
export function reparentBlock(view: View, id: string, parentId: string | null, index?: number): View {
  const block = findBlock(view, id);
  if (!block) return view;
  if (parentId !== null) {
    const parent = findBlock(view, parentId);
    if (!parent || subtreeIds(block).has(parentId)) return view;
  }
  const detached = removeBlock(view, id);
  return withChildren(detached, parentId, (children) => {
    const at = index === undefined ? children.length : clamp(Math.trunc(index), 0, children.length);
    return [...children.slice(0, at), block, ...children.slice(at)];
  });
}

/* ------------------------------------------------------------------ */
/* Verschachteln, Umhängen, Löschen (c0110)                            */
/* ------------------------------------------------------------------ */

/**
 * Wieviel Rechenstaub beim Vergleich zweier Kanten durchgeht. Die Anteile stehen
 * auf vier Stellen (`round`), das Fließkomma rechnet 0.3 + 0.3 aber als
 * 0.6000000000000001 — ein Millionstel des Fensters ist weit unter einem Pixel
 * und rettet davor, dass ein Kasten „gerade eben nicht mehr“ in seinem Elter
 * liegt.
 */
const FIT = 1e-6;

/** Ob `inner` ganz in `outer` liegt — die Kante gilt als drinnen. */
function fits(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - FIT &&
    inner.y >= outer.y - FIT &&
    inner.x + inner.w <= outer.x + outer.w + FIT &&
    inner.y + inner.h <= outer.y + outer.h + FIT
  );
}

/**
 * Der Kasten, in den eine Fläche GEHÖRT: der unterste, der sie ganz umschließt.
 * `null` heißt, dass keiner sie umschließt — dann gehört sie an die Wurzel.
 * Liegen mehrere gleich tief in Frage, gewinnt der zuletzt gezeichnete: Er liegt
 * oben, und gemeint ist, was man sieht.
 *
 * Das ist die EINE Regel für beides (c0110): Ein Kasten, der in einen anderen
 * geschoben oder gezeichnet wird, wird sein Kind; einer, der herausgeschoben
 * wird, hängt sich um — bis zur Wurzel. So sagt der Baum nie etwas anderes als
 * das Bild, und ein Kind liegt stets in seinem Elter.
 *
 * `skipId` nimmt einen Kasten samt seinem ganzen Zweig aus der Wahl. Beim
 * Umhängen ist das zweierlei nötig: Er umschließt sich selbst immer, und sein
 * eigener Nachfahre darf niemals sein Elter werden (kein Kreis).
 *
 * Gesucht wird im ganzen Baum, auch unter einem Kasten, der die Fläche NICHT
 * umschließt: Ein Kind darf über seinen Elter hinausragen (c0104), ein Zweig
 * lässt sich also nicht vorschnell abschneiden.
 */
export function containerIn(blocks: readonly Block[], rect: Rect, skipId?: string): Block | null {
  let found: Block | null = null;
  let foundDepth = -1;
  const step = (list: readonly Block[], depth: number): void => {
    for (const b of list) {
      if (skipId !== undefined && b.id === skipId) continue;
      if (depth >= foundDepth && fits(rect, b.rect)) {
        found = b;
        foundDepth = depth;
      }
      step(b.children, depth + 1);
    }
  };
  step(blocks, 0);
  return found;
}

/** Der Kasten, in den eine Fläche gehört (siehe `containerIn`). */
export function containerFor(view: View, rect: Rect, skipId?: string): Block | null {
  return containerIn(view.blocks, rect, skipId);
}

/** Der Elter eines Kastens — `null` an der Wurzel (und für einen, den es nicht gibt). */
export function parentOf(view: View, id: string): Block | null {
  let found: Block | null = null;
  walkBlocks(view, (b, parent) => {
    if (b.id === id) found = parent;
  });
  return found;
}

/** Wie tief ein Kasten liegt (0 an der Wurzel) — -1: Es gibt ihn nicht. */
function depthOf(view: View, id: string): number {
  let at = -1;
  walkBlocks(view, (b, _parent, depth) => {
    if (b.id === id) at = depth;
  });
  return at;
}

/** Wieviele Ebenen unter einem Kasten hängen (0: keine). */
function heightOf(block: Block): number {
  return block.children.reduce((max, c) => Math.max(max, heightOf(c) + 1), 0);
}

/**
 * Ob unter `parentId` noch ein Zweig von `height` weiteren Ebenen Platz hat.
 * `normalizeDesign` kappt bei `MAX_DESIGN_DEPTH`, und geschrieben wird stets
 * zurechtgerückt — was tiefer läge, wäre beim nächsten Speichern still
 * verloren. Darum wird gar nicht erst so tief geschachtelt.
 */
export function canNestUnder(view: View, parentId: string | null, height = 0): boolean {
  if (parentId === null) return height < MAX_DESIGN_DEPTH;
  const depth = depthOf(view, parentId);
  if (depth < 0) return false;
  return depth + 1 + height < MAX_DESIGN_DEPTH;
}

/**
 * Hängt einen Kasten dorthin, wo er LIEGT (c0110): unter den untersten Kasten,
 * der ihn ganz umschließt, oder an die Wurzel, wenn ihn keiner umschließt. Seine
 * Kinder kommen mit, verschoben wird nichts (die Anteile sind absolut, c0104) —
 * das Umhängen ist eine reine Aussage über die Gliederung.
 *
 * Hängt er schon richtig, kommt die übergebene Ansicht unverändert zurück; das
 * gilt auch für einen Zug, der nicht geht: ein Kreis (den `containerIn` gar nicht
 * erst anbietet) oder eine Schachtelung, die zu tief würde.
 */
export function nestBlock(view: View, id: string): View {
  const block = findBlock(view, id);
  if (!block) return view;
  const target = containerFor(view, block.rect, id);
  const parentId = target?.id ?? null;
  if (parentId === (parentOf(view, id)?.id ?? null)) return view;
  if (!canNestUnder(view, parentId, heightOf(block))) return view;
  return reparentBlock(view, id, parentId);
}

/**
 * Löscht einen Kasten — seine Kinder rücken an seine Stelle unter seinem Elter
 * (bzw. an die Wurzel). Gelöscht wird also der RAHMEN, nicht der Inhalt: Ein
 * Griff daneben soll nicht einen halben Entwurf mitnehmen, und weil die Anteile
 * absolut sind (c0104), bleibt dabei alles liegen, wo es liegt. Wer einen ganzen
 * Zweig los sein will, löscht ihn von innen nach außen.
 *
 * Eine unbekannte Id lässt die Ansicht unverändert.
 */
export function deleteBlock(view: View, id: string): View {
  if (!findBlock(view, id)) return view;
  const step = (blocks: readonly Block[]): Block[] =>
    blocks.flatMap((b) => (b.id === id ? b.children : [{ ...b, children: step(b.children) }]));
  return { ...view, blocks: step(view.blocks) };
}
