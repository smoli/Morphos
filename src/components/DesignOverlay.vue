<script setup lang="ts">
import { computed, ref } from 'vue';
import DesignBlock from './DesignBlock.vue';
import DesignInspector from './DesignInspector.vue';
import DesignViewBar from './DesignViewBar.vue';
import DesignViewInspector from './DesignViewInspector.vue';
import {
  DEFAULT_BLOCK_NAME,
  MIN_BLOCK_SIZE,
  blockBounds,
  containerIn,
  findBlockIn,
  moveRect,
  pathIn,
  resizeRect,
  round,
  type Block,
  type Handle,
  type Rect,
  type View,
} from '@/core/design';
import { snapLines, snapMoved, snapSized, type Guide } from '@/core/snap';

/**
 * Der Entwurfs-Modus des UI-Designers (e15): eine durchscheinende Schicht über
 * der laufenden App, auf der die Kästen des Entwurfs liegen — jeder an seinem
 * Anteil des Fensters (core/design), jeder mit seinem Namen, geschachtelte in
 * ihrem Elter. Die App darunter läuft weiter und bleibt zu sehen; nur anfassen
 * lässt sie sich nicht, solange die Schicht liegt.
 *
 * Seit c0107 ist die Fläche auch die ZEICHENFLÄCHE: Ein Zug mit der Maus zieht
 * einen neuen Kasten auf, der sogleich seinen Namen bekommt — erst mit dem
 * Namen ist er fertig und geht als `draw` nach oben. Ein Klick auf den Namen
 * eines bestehenden Kastens benennt ihn um (`rename`). Geschrieben wird hier
 * nichts: Das tut das Fenster über den Store, und maßgeblich bleibt die Datei.
 *
 * Seit c0108 hat ein Kasten mehr zu sagen als seinen Namen: Ein Klick auf ihn
 * WÄHLT ihn aus und öffnet sein Feld (DesignInspector) für Rolle und
 * Anweisungen; ein Klick daneben hebt die Auswahl auf. Ausgewählt ist immer nur
 * einer — das Feld redet stets von einem Kasten.
 *
 * Seit c0109 lässt sich der ausgewählte Kasten ANFASSEN: am Rumpf schieben
 * (`move`), an einem seiner Griffe größer ziehen (`resize`). Beides ist
 * derselbe Zug wie beim Zeichnen — nur bedeutet er etwas anderes, und was er
 * bedeutet, entscheidet der Anfang: Ein Druck auf den ausgewählten Kasten
 * meldet sich als Griff (DesignBlock: `grab`), jeder andere zeichnet. Auswählen
 * geht dem Anfassen also voraus — sonst ließe sich in einem Kasten nie ein
 * zweiter aufziehen.
 *
 * Seit c0110 sagt die LAGE eines Kastens, wohin er gehört: Was ganz in einem
 * anderen Kasten liegt, wird sein Kind; was herausgeschoben wird, hängt sich um
 * (core/design: `containerIn`, `nestBlock`). Die Fläche rechnet das nicht aus,
 * um es zu tun — das tut der Store —, sondern um es zu ZEIGEN: Der künftige
 * Elter leuchtet auf, solange der Zug läuft. Und das Löschen sitzt im Feld des
 * ausgewählten Kastens (DesignInspector) und geht als `delete` nach oben.
 *
 * Seit c0111 zeigt das Feld die Gliederung um seinen Kasten — den Weg von der
 * Wurzel zu ihm (`pathIn`) und seine Kinder. Über beides wird auch AUSGEWÄHLT:
 * Auf der Fläche ist stets das Unterste gemeint, ein Elter unter lauter Kindern
 * ist dort also nicht mehr zu treffen — im Feld schon.
 *
 * Seit c0113 hat ein Entwurf ANSICHTEN: Die Fläche zeigt stets EINE von ihnen
 * (`blocks` sind ihre Kästen), gewechselt wird in der Reiterleiste darüber
 * (DesignViewBar), und ihr Titel samt Beschreibung steht im Feld links unten
 * (DesignViewInspector) — gegenüber dem Feld des ausgewählten Kastens, denn
 * beides sind zwei Ebenen desselben Entwurfs. Angelegt, benannt und gelöscht
 * wird auch hier nichts: Die Schicht bittet nach oben, geschrieben wird im
 * Store.
 *
 * Seit c0114 richtet sich ein Zug AUS: Kanten und Mitten rasten an denen der
 * übrigen Kästen und an Rand und Mitte des Fensters ein (core/snap), und
 * Hilfslinien zeigen, woran. Ausgerichtet wird dabei genau einmal — an dem
 * Gummiband, das ohnehin schon zeigt, wo der Zug landet (`resolve`). Was zu sehen
 * ist, ist damit auch das, was gespeichert wird. Wer daneben treffen will, schaltet
 * das Ausrichten in der Kopfzeile ab oder hält für den einen Zug Alt gedrückt.
 *
 * Die Anteile beziehen sich auf die Fläche (`.design-stage`) — dieselbe Fläche,
 * auf der auch gezeichnet wird. Was gezeichnet ist und was zu sehen ist, meint
 * damit dasselbe.
 */
const props = defineProps<{
  /** Die Kästen der GEZEIGTEN Ansicht (stores/app: designBlocks). */
  blocks: Block[];
  /** Alle Ansichten des Entwurfs (c0113) — ohne Entwurf schlicht keine. */
  views?: View[];
  /** Welche davon auf der Fläche liegt; null, solange es keine gibt. */
  viewId?: string | null;
  /**
   * Es entsteht gerade eine NEUE App (c0112): Ihr Entwurf liegt dann nicht in
   * einem Ordner, sondern im Fenster, und geht mit dem ersten Wunsch mit.
   * Gezeichnet wird genau wie sonst — nur gesagt werden muss es. (Heißt wie im
   * ChatDock `newApp` und nicht `draft`: Ein „Entwurf“ ist hier schon der
   * aufgezogene, noch namenlose Kasten.)
   */
  newApp?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  /** Ein neuer Kasten: seine Lage (Anteile des Fensters) und sein Name. */
  draw: [rect: Rect, name: string];
  /** Ein bestehender Kasten heißt fortan anders. */
  rename: [id: string, name: string];
  /** Ein Kasten bekommt (oder verliert) seine Rolle bzw. seine Anweisungen. */
  describe: [id: string, patch: { instructions?: string; type?: string }];
  /** Ein Kasten ist samt seiner Kinder an eine neue Stelle geschoben worden. */
  move: [id: string, to: { x: number; y: number }];
  /** Ein Kasten ist an einer seiner Kanten größer (oder kleiner) gezogen worden. */
  resize: [id: string, rect: Rect];
  /** Ein Kasten soll weg (c0110) — seine Kinder rücken an seine Stelle. */
  delete: [id: string];
  /** Fortan soll jene Ansicht zu sehen sein (c0113). */
  'select-view': [id: string];
  /** Eine weitere Ansicht, bitte. */
  'add-view': [];
  /** Titel bzw. Beschreibung einer Ansicht sind fortan andere. */
  'describe-view': [id: string, patch: { title?: string; description?: string }];
  /** Eine Ansicht soll weg — samt ihren Kästen. */
  'delete-view': [id: string];
}>();

/** Die Id des noch ungeborenen Kastens — er steht in keinem Entwurf. */
const DRAFT_ID = '(entwurf)';

const stage = ref<HTMLElement | null>(null);

/** Der laufende Zug: sein Anfang und sein derzeitiges Ende, in Anteilen. */
const from = ref<{ x: number; y: number } | null>(null);
const to = ref<{ x: number; y: number } | null>(null);

/** Der aufgezogene, noch namenlose Kasten — bis der Name steht. */
const draft = ref<Rect | null>(null);

/** Welcher Kasten gerade seinen Namen bekommt (auch der Entwurf). */
const editingId = ref<string | null>(null);

/** Welcher Kasten ausgewählt ist — sein Feld steht offen (c0108). */
const selectedId = ref<string | null>(null);

/** Steht das Feld der gezeigten Ansicht offen (c0113)? */
const viewOpen = ref(false);

/** Richten sich Züge an den anderen Kästen aus (c0114)? */
const snapping = ref(true);

/**
 * Ob die Alt-Taste gedrückt ist: Sie setzt das Ausrichten für den laufenden Zug
 * aus — für das eine Mal, in dem der Kasten eben NICHT bündig liegen soll. Was
 * beim Umschalter in der Kopfzeile eine Ansage für alle Züge ist, ist hier eine
 * für diesen einen.
 */
const free = ref(false);

/** Ob der laufende Zug ausgerichtet wird. */
const aligns = computed(() => snapping.value && !free.value);

/**
 * Die gezeigte Ansicht, stets frisch aus den Ansichten des Fensters gesucht —
 * wie der ausgewählte Kasten: Nach dem Speichern kommt ein neuer Entwurf von
 * der Platte, und das Feld soll DEN zeigen.
 */
const view = computed<View | null>(
  () => props.views?.find((v) => v.id === props.viewId) ?? null,
);

/**
 * Der laufende Zug an einem Kasten (c0109): welcher, woran, und wie er dalag,
 * als er angefasst wurde. `null` heißt: Dieser Zug zeichnet einen neuen Kasten.
 */
const gesture = ref<{ id: string; handle: Handle | null; rect: Rect; bounds: Rect } | null>(null);

/**
 * Was ein Kasten für den GERADE laufenden Druck gemeldet hat. Kein `ref`: Der
 * Wert lebt nur von `grab` bis `onPointerDown` — beides geschieht in einem
 * Zuge, denn der Druck läuft vom Kasten weiter auf die Fläche.
 */
let grabbed: { id: string; handle: Handle | null } | null = null;

/**
 * Ob der letzte Zug ein Kasten-Zug war. Er endet neben dem Kasten (im Baum
 * wandert der Kasten erst mit der Antwort von der Platte), und der Klick, der
 * darauf folgt, gilt der Fläche — er darf die Auswahl nicht aufheben.
 */
let dragged = false;

/**
 * Der ausgewählte Kasten, stets frisch aus den Kästen des Fensters gesucht: Nach
 * dem Speichern kommt ein neuer Baum von der Platte, und das Feld soll DEN
 * zeigen und nicht einen alten Abzug.
 */
const selected = computed<Block | null>(() => findBlockIn(props.blocks, selectedId.value ?? ''));

/**
 * Die Vorfahren des ausgewählten Kastens, von der Wurzel bis zu seinem Elter
 * (c0111): der Weg zu ihm ohne ihn selbst. Gerechnet wird er in core/design
 * (`pathIn`) und ebenfalls frisch aus den Kästen des Fensters — was das Feld
 * über die Gliederung sagt, kommt so aus derselben Quelle wie der Kasten.
 */
const ancestors = computed<Block[]>(() => pathIn(props.blocks, selectedId.value ?? '').slice(0, -1));

/**
 * Der laufende Zug, fertig gerechnet: die Fläche, in der er landet, und die
 * Linien, an denen sie hängt (c0114). Der Kasten selbst bleibt so lange liegen —
 * maßgeblich ist, was von der Platte zurückkommt.
 */
const drag = computed<{ rect: Rect; guides: Guide[] } | null>(() => {
  if (!from.value || !to.value) return null;
  return resolve(from.value, to.value, gesture.value, aligns.value);
});

/**
 * Das Gummiband während des Zugs: beim Zeichnen die aufgezogene Fläche, beim
 * Anfassen der Platz, an dem der Kasten landet.
 */
const band = computed<Rect | null>(() => drag.value?.rect ?? null);

/** Die Hilfslinien des laufenden Zugs — ohne Zug (und ohne Einrasten) keine. */
const guides = computed<Guide[]>(() => drag.value?.guides ?? []);

/**
 * Der Kasten, in dem der laufende Zug LANDEN würde (c0110) — sein künftiger
 * Elter. Gerechnet wird mit derselben Funktion, die den Baum hinterher umhängt
 * (`containerIn` in core/design): Zwei Rechnungen für dasselbe wären zwei
 * Wahrheiten, und die Vorschau löge früher oder später. Der geschobene Kasten
 * selbst (samt seinem Zweig) kommt nicht in Frage — kein Kreis.
 */
const dropId = computed<string | null>(() => {
  const rect = band.value;
  if (!rect) return null;
  return containerIn(props.blocks, rect, gesture.value?.id)?.id ?? null;
});

/** Der Kasten, in dem der Name des neuen eingetragen wird. */
const draftBlock = computed<Block | null>(() =>
  draft.value ? { id: DRAFT_ID, name: DEFAULT_BLOCK_NAME, rect: draft.value, children: [] } : null,
);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Ein Anteil als Prozentzahl fürs Stylesheet — ohne den Staub des Fließkommas. */
function percent(share: number): string {
  return `${+(share * 100).toFixed(2)}%`;
}

/** Wo auf der Fläche der Zeiger steht — als Anteil, nicht als Pixel (c0104). */
function shareAt(event: PointerEvent): { x: number; y: number } {
  const r = stage.value?.getBoundingClientRect();
  return {
    x: clamp01((event.clientX - (r?.left ?? 0)) / (r?.width || 1)),
    y: clamp01((event.clientY - (r?.top ?? 0)) / (r?.height || 1)),
  };
}

/** Die Fläche zwischen zwei Punkten — in welcher Richtung auch gezogen wurde. */
function span(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/**
 * Wohin ein angefasster Kasten kommt: geschoben (samt seiner Kinder, darum die
 * Grenzen des ganzen Zweigs) oder an einer Kante gezogen. Gerechnet wird in
 * core/design — dieselben Funktionen zeigen den Zug an und führen ihn aus.
 */
function shaped(g: NonNullable<typeof gesture.value>, a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return g.handle ? resizeRect(g.rect, g.handle, dx, dy) : moveRect(g.rect, dx, dy, g.bounds);
}

/**
 * Was ein Zug ergibt — die EINE Rechnung dahinter (c0114): erst die Fläche
 * (gezeichnet, geschoben oder gezogen), dann das Ausrichten an den übrigen
 * Kästen. Sie steht hier und nicht im Gummiband, weil das Ende des Zugs dasselbe
 * braucht: Zwei Rechnungen wären zwei Wahrheiten, und gespeichert würde am Ende
 * eine andere Fläche, als zu sehen war.
 *
 * Der angefasste Kasten kommt als Ziel nicht in Frage (`snapLines(…, id)`) — samt
 * seinem Zweig, denn der wandert mit ihm. Beim Schieben wandern auch die Grenzen
 * mit, die im Fenster bleiben müssen: Ausgerichtet wird, wo der Kasten JETZT
 * liegt, nicht, wo er lag.
 */
function resolve(
  a: { x: number; y: number },
  b: { x: number; y: number },
  g: typeof gesture.value,
  align: boolean,
): { rect: Rect; guides: Guide[] } {
  const rect = g ? shaped(g, a, b) : span(a, b);
  if (!align) return { rect, guides: [] };
  const lines = snapLines(props.blocks, g?.id);
  if (g && !g.handle) {
    const bounds = {
      ...g.bounds,
      x: round(g.bounds.x + (rect.x - g.rect.x)),
      y: round(g.bounds.y + (rect.y - g.rect.y)),
    };
    return snapMoved(rect, lines, bounds);
  }
  return snapSized(rect, g?.handle ?? null, lines);
}

/**
 * Ein Kasten meldet, dass er angefasst wurde. Der erste gewinnt: Ein Druck auf
 * einen Griff läuft über den Kasten weiter (und ein Kind über seinen Elter),
 * gemeint ist aber, was zuunterst liegt.
 *
 * Gemeldet wird darum jeder Kasten, angefasst ist nur der ausgewählte
 * (`onPointerDown`): Ein Druck auf ein NICHT ausgewähltes Kind zeichnet, auch
 * wenn dessen Elter ausgewählt ist — sonst wäre die Fläche jedes Kindes für den
 * Stift verloren, sobald sein Elter ausgewählt ist, und in ein Kind hinein
 * ließe sich nichts mehr schachteln (c0110).
 */
function onGrab(id: string, handle: Handle | null): void {
  if (grabbed || draft.value) return;
  grabbed = { id, handle };
}

function onPointerDown(event: PointerEvent): void {
  // Ein noch offenes Namensfeld schließt sich von selbst (Verlassen des Feldes)
  // — erst danach beginnt der neue Zug.
  const grab = grabbed?.id === selectedId.value ? grabbed : null;
  grabbed = null;
  dragged = false;
  if (event.button !== undefined && event.button !== 0) return;
  free.value = !!event.altKey;
  from.value = shareAt(event);
  to.value = from.value;
  const block = grab ? findBlockIn(props.blocks, grab.id) : null;
  if (grab && block) gesture.value = { ...grab, rect: block.rect, bounds: blockBounds(block) };
  (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!from.value) return;
  // Alt darf mitten im Zug gedrückt (und wieder losgelassen) werden: Ob ein Zug
  // sich ausrichtet, entscheidet sich beim Hinsehen, nicht beim Anfassen.
  free.value = !!event.altKey;
  to.value = shareAt(event);
}

/**
 * Ende des Zugs: Was zu klein ist, war ein Klick und kein Zug — daraus wird
 * kein Kasten (sonst hinterließe jedes Antippen einen Krümel im Entwurf).
 * Gemessen wird dafür der ROHE Zug: Sonst bliese das Ausrichten ein Antippen
 * dicht an zwei Linien zu einem Kasten auf.
 */
function onPointerUp(event: PointerEvent): void {
  if (!from.value) return;
  const at = shareAt(event);
  const start = from.value;
  const g = gesture.value;
  const align = snapping.value && !event.altKey;
  from.value = null;
  to.value = null;
  gesture.value = null;
  free.value = false;
  if (g) {
    dragged = true;
    finish(g, resolve(start, at, g, align).rect);
    return;
  }
  const drawn = span(start, at);
  if (drawn.w < MIN_BLOCK_SIZE || drawn.h < MIN_BLOCK_SIZE) return;
  draft.value = resolve(start, at, null, align).rect;
  editingId.value = DRAFT_ID;
}

/**
 * Das Ende eines Zugs an einem Kasten. Liegt er, wo er lag, geht nichts nach
 * oben: Ein Klick auf den ausgewählten Kasten ist kein Zug und soll die Datei
 * nicht neu schreiben. (Beide Rechnungen runden auf vier Stellen, ein Vergleich
 * auf Gleichheit genügt also.)
 */
function finish(g: NonNullable<typeof gesture.value>, rect: Rect): void {
  const was = g.rect;
  if (rect.x === was.x && rect.y === was.y && rect.w === was.w && rect.h === was.h) return;
  if (g.handle) emit('resize', g.id, rect);
  else emit('move', g.id, { x: rect.x, y: rect.y });
}

/**
 * Ein Klick auf einen Kasten wählt ihn aus. Solange ein aufgezogener Kasten auf
 * seinen Namen wartet, bleibt der Klick unbeachtet: Er ist das Ende des
 * Zeichenzugs und meint keine Auswahl.
 */
function onSelect(id: string): void {
  if (draft.value || id === DRAFT_ID) return;
  selectedId.value = id;
}

/**
 * Ein Klick auf die freie Fläche hebt die Auswahl auf — der Klick am Ende eines
 * Zugs aber nicht: Wer einen Kasten schiebt, wählt ihn damit nicht ab.
 */
function onStageClick(): void {
  if (draft.value || dragged) return;
  selectedId.value = null;
}

/** Der Name steht: der Entwurf wird ein Kasten, ein Kasten heißt fortan anders. */
function onCommit(id: string, name: string): void {
  const rect = draft.value;
  editingId.value = null;
  draft.value = null;
  if (id === DRAFT_ID) {
    if (rect) emit('draw', rect, name);
    return;
  }
  emit('rename', id, name);
}

/** Abbruch: Ein Entwurf ohne Namen wird nichts, ein Name bleibt, wie er war. */
function onCancel(): void {
  editingId.value = null;
  draft.value = null;
}

/**
 * Eine andere Ansicht (c0113). Die Auswahl bleibt nicht: Sie galt einem Kasten
 * der alten Ansicht, und drüben gibt es ihn nicht.
 */
function onSelectView(id: string): void {
  selectedId.value = null;
  emit('select-view', id);
}

/**
 * Eine weitere Ansicht — ihr Feld geht sogleich auf: Eine neue Ansicht heißt
 * vorerst „Ansicht 2“, und das Erste, was man mit ihr tun will, ist, ihr einen
 * Namen zu geben.
 */
function onAddView(): void {
  selectedId.value = null;
  viewOpen.value = true;
  emit('add-view');
}

/**
 * Die gezeigte Ansicht soll weg. Ihr Feld geht zu — es redete sonst von einer
 * Ansicht, die es nicht mehr gibt; welche danach zu sehen ist, sagt das Fenster.
 */
function onDeleteView(): void {
  const gone = view.value;
  if (!gone) return;
  viewOpen.value = false;
  selectedId.value = null;
  emit('delete-view', gone.id);
}
</script>

<template>
  <div class="design-overlay">
    <div class="design-head">
      <span class="design-title">Entwurf</span>
      <!-- Vor der App gehört dazu, wohin er geht: mit dem ersten Wunsch. -->
      <span v-if="newApp" class="design-goes">geht mit dem ersten Wunsch mit</span>
      <span class="design-hint">
        Ziehen zeichnet, ein Klick wählt aus — den ausgewählten Kasten schiebt und zieht
        man zurecht; in einen Kasten hinein heißt hinein
      </span>
      <!-- Das Ausrichten ist ein Angebot (c0114) — abschalten muss man dürfen. -->
      <button
        type="button"
        class="design-snap"
        :class="{ on: snapping }"
        :aria-pressed="snapping"
        title="Kanten und Mitten rasten aneinander ein — Alt hält es für einen Zug an"
        @click="snapping = !snapping"
      >
        Ausrichten
      </button>
      <button type="button" class="design-close" @click="emit('close')">Schließen</button>
    </div>

    <!-- Welche Ansicht auf der Fläche liegt (c0113) — und wo es noch mehr gibt. -->
    <DesignViewBar
      :views="views ?? []"
      :view-id="viewId ?? null"
      @select="onSelectView"
      @add="onAddView"
      @edit="viewOpen = true"
    />

    <div
      ref="stage"
      class="design-stage"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @click="onStageClick"
    >
      <p v-if="!blocks.length && !draftBlock" class="design-empty">
        {{ newApp
          ? 'Zieh die Kästen auf, die diese App haben soll — der Agent baut danach.'
          : view
            ? 'Diese Ansicht ist noch leer — zieh einen Kasten auf.'
            : 'Für diese App gibt es noch keinen Entwurf — zieh einen Kasten auf.' }}
      </p>
      <DesignBlock
        v-for="block in blocks"
        :key="block.id"
        :block="block"
        :editing-id="editingId"
        :selected-id="selectedId"
        :drop-id="dropId"
        @edit="editingId = $event"
        @select="onSelect"
        @grab="onGrab"
        @commit="onCommit"
        @cancel="onCancel"
      />
      <!-- Woran der laufende Zug hängt (c0114): quer über die ganze Fläche, denn
           die Linie gilt dem Fenster und nicht nur dem einen Nachbarn. -->
      <div
        v-for="guide in guides"
        :key="`${guide.axis}${guide.at}`"
        class="design-guide"
        :class="`dg-${guide.axis}`"
        :style="guide.axis === 'x' ? { left: percent(guide.at) } : { top: percent(guide.at) }"
      />
      <!-- Das Gummiband des laufenden Zugs — noch kein Kasten, nur eine Absicht. -->
      <div v-if="band" class="design-band" :style="{
        left: `${band.x * 100}%`, top: `${band.y * 100}%`,
        width: `${band.w * 100}%`, height: `${band.h * 100}%`,
      }" />
      <!-- Der aufgezogene Kasten, solange er auf seinen Namen wartet. -->
      <DesignBlock
        v-if="draftBlock"
        :block="draftBlock"
        :editing-id="editingId"
        @commit="onCommit"
        @cancel="onCancel"
      />
      <!-- Das Feld zum ausgewählten Kasten: Rolle und Anweisungen. Es liegt in
           der Fläche, fängt aber jeden Zeiger ab (DesignInspector). -->
      <DesignInspector
        v-if="selected"
        :block="selected"
        :ancestors="ancestors"
        @update="(patch) => selected && emit('describe', selected.id, patch)"
        @delete="selected && emit('delete', selected.id)"
        @select="onSelect"
        @close="selectedId = null"
      />
      <!-- Und das Feld zur gezeigten Ansicht: Titel und Beschreibung (c0113).
           Es liegt gegenüber, damit beide Felder nebeneinander bestehen. -->
      <DesignViewInspector
        v-if="viewOpen && view"
        :view="view"
        @update="(patch) => view && emit('describe-view', view.id, patch)"
        @delete="onDeleteView"
        @close="viewOpen = false"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * Die Schicht deckt das Fenster ab, ohne es zu verdecken: Der Untergrund bleibt
 * durchscheinend, damit der Entwurf über der App liegt, auf die er sich
 * bezieht. Sie liegt unter dem Chat (6) und der Fehlermeldung (5) — was
 * mitzuteilen ist, gehört nach vorn.
 */
.design-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  background: rgba(15, 17, 21, 0.35);
}
.design-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: rgba(15, 17, 21, 0.85);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.design-title {
  font-weight: 600;
}
/* Wohin der Entwurf einer noch nicht vorhandenen App geht (c0112). */
.design-goes {
  flex-shrink: 0;
  color: var(--accent);
}
.design-hint {
  flex: 1;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.design-close,
.design-snap {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.design-close:hover,
.design-snap:hover {
  border-color: var(--accent);
}
/* Der Umschalter sagt schon von sich aus, ob das Ausrichten gilt (c0114) — in
   der Farbe der Hilfslinien, die er ein- und ausschaltet. */
.design-snap {
  flex-shrink: 0;
  color: var(--muted);
}
.design-snap.on {
  border-color: rgba(255, 108, 176, 0.8);
  color: rgba(255, 108, 176, 0.95);
}
/* Die Fläche, auf der die Anteile des Entwurfs gelten: der Rest des Fensters.
   Zugleich die Zeichenfläche — darum das Fadenkreuz. */
.design-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
  cursor: crosshair;
  /* Ein Zug soll zeichnen und nicht die Beschriftungen markieren. */
  user-select: none;
  touch-action: none;
}
/* Das Gummiband: gestrichelt, damit es sich von einem fertigen Kasten unterscheidet. */
.design-band {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed rgba(108, 140, 255, 0.9);
  border-radius: 8px;
  background: rgba(108, 140, 255, 0.08);
  pointer-events: none;
}
/*
 * Die Hilfslinien (c0114): haarfein und quer über die ganze Fläche, in einer
 * eigenen Farbe — sie sind weder ein Kasten (blau) noch ein künftiger Elter
 * (bernstein), sondern sagen nur: hier liegt es bündig. Sie liegen über den
 * Kästen, damit man sie auch in einem gefüllten Entwurf sieht.
 */
.design-guide {
  position: absolute;
  z-index: 1;
  background: rgba(255, 108, 176, 0.9);
  pointer-events: none;
}
.dg-x {
  top: 0;
  bottom: 0;
  width: 1px;
}
.dg-y {
  left: 0;
  right: 0;
  height: 1px;
}
.design-empty {
  margin: 0;
  padding: 14px 16px;
  color: var(--muted);
  font-size: 13px;
}
</style>
