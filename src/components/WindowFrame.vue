<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useDesktopStore } from '@/stores/desktop';
import { useAgentsStore } from '@/stores/agents';
import BusyDot from './BusyDot.vue';
import AppIcon from './AppIcon.vue';
import type { DesktopWindow } from '@/stores/desktop';

/**
 * Der Rahmen eines Fensters auf dem Desktop: Geometrie, Ziehen, Größe ändern,
 * Fokus und die Fensterknöpfe — alles, was der Fenstermanager beisteuert.
 *
 * Was IM Fenster liegt, bringen die Aufsätze mit: components/AppWindow zeigt
 * eine erzeugte App, components/SystemWindow eine Ansicht der Schale (etwa den
 * Datei-Explorer). Sie füllen den Inhalt und, wo nötig, Icon, Titel und eigene
 * Knöpfe der Titelleiste.
 *
 * Im Kachel-Modus (`tiled`, c0066) kommt die Geometrie NICHT von hier: Der
 * Rahmen liest sein Rechteck aus dem Kachel-Baum (stores/desktop → core/tiling)
 * und rückt nach, sobald der sich ändert. Frei verschieben und am Griff größer
 * machen gibt es dann nicht: Die Titelleiste trägt das Fenster stattdessen auf
 * eine andere Kachel, wo die beiden die Plätze tauschen (c0067) — und die Größe
 * ändert man an der Fuge (components/TileGaps).
 */
const props = defineProps<{ win: DesktopWindow; single?: boolean; tiled?: boolean }>();

const desktop = useDesktopStore();
const agents = useAgentsStore();

const interacting = ref(false); // Ziehen/Größe ändern → Schutzschicht über den iframes

// Vollflächig (kein Ziehen/Größe): im Einzel-Modus oder wenn maximiert.
const full = computed(() => props.single || props.win.maximized);

// Gekachelt: Solange das Fenster nicht maximiert die Fläche füllt, sagt der
// Baum, wo es liegt. Fehlt sein Rechteck (die Fläche ist noch nicht gemessen),
// bleibt es bei der eigenen Geometrie.
const tile = computed(() =>
  props.tiled && !full.value ? desktop.tileRects[props.win.instanceId] ?? null : null,
);
// Frei beweglich ist ein Fenster nur im Fenster-Modus.
const movable = computed(() => !full.value && !props.tiled);
// Gekachelt trägt die Titelleiste das Fenster auf eine andere Kachel (c0067).
const swappable = computed(() => !full.value && !!props.tiled);

// Dieses Fenster hängt gerade am Zeiger …
const swapping = computed(() => desktop.tileSwap?.id === props.win.instanceId);
// … bzw. auf dieser Kachel würde es landen (der Hinweis liegt über ihr).
const dropTarget = computed(() => desktop.tileSwap?.targetId === props.win.instanceId);

const frameStyle = computed(() => {
  if (full.value) return { zIndex: props.win.z };
  const r = tile.value ?? props.win;
  return {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
    zIndex: props.win.z,
  };
});

// Arbeitet ein Agent für dieses Fenster (bzw. für die App, die es zeigt)? Das
// gilt auch für einen wartenden Wunsch und für einen Lauf, der ohne sein
// (geschlossenes) Fenster weiterarbeitet.
const agentBusy = computed(() => agents.isWindowBusy(props.win.instanceId, props.win.appId));

onBeforeUnmount(() => stopInteraction());

function focus(): void {
  desktop.focusWindow(props.win.instanceId);
}
function close(): void {
  desktop.closeWindow(props.win.instanceId);
}
function minimize(): void {
  desktop.minimizeWindow(props.win.instanceId);
}
function toggleMaximize(): void {
  desktop.toggleMaximize(props.win.instanceId);
}
/** Einzel-Modus: zurück zum Desktop — das Fenster läuft im Hintergrund weiter. */
function backToDesktop(): void {
  desktop.showDesktop();
}

// ---- Ziehen (Titelleiste) ----

/** Was die Titelleiste tut: im Fenster-Modus verschieben, gekachelt tauschen. */
function startTitleDrag(e: MouseEvent): void {
  if (movable.value) startDrag(e);
  else if (swappable.value) startSwap(e);
}

let dragDX = 0;
let dragDY = 0;
function startDrag(e: MouseEvent): void {
  focus();
  interacting.value = true;
  dragDX = e.clientX - props.win.x;
  dragDY = e.clientY - props.win.y;
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopInteraction);
}
function onDrag(e: MouseEvent): void {
  desktop.moveWindow(props.win.instanceId, e.clientX - dragDX, e.clientY - dragDY);
}

// ---- Größe ändern (Griff unten rechts) ----
let resW = 0;
let resH = 0;
let resX = 0;
let resY = 0;
function startResize(e: MouseEvent): void {
  focus();
  interacting.value = true;
  resW = props.win.w;
  resH = props.win.h;
  resX = e.clientX;
  resY = e.clientY;
  window.addEventListener('mousemove', onResize);
  window.addEventListener('mouseup', stopInteraction);
}
function onResize(e: MouseEvent): void {
  desktop.resizeWindow(props.win.instanceId, resW + (e.clientX - resX), resH + (e.clientY - resY));
}

// ---- Kacheln tauschen (Titelleiste im Kachel-Modus, c0067) ----
function startSwap(e: MouseEvent): void {
  if (e.button !== 0 || !desktop.startTileSwap(props.win.instanceId)) return;
  interacting.value = true;
  onSwap(e);
  window.addEventListener('mousemove', onSwap);
  window.addEventListener('mouseup', endSwap);
}
function onSwap(e: MouseEvent): void {
  desktop.aimTileSwap(desktop.stagePoint(e));
}
function endSwap(): void {
  // Loslassen tauscht — über einer fremden Kachel; sonst bleibt alles liegen.
  desktop.dropTileSwap();
  stopInteraction();
}

function stopInteraction(): void {
  interacting.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mousemove', onResize);
  window.removeEventListener('mousemove', onSwap);
  window.removeEventListener('mouseup', stopInteraction);
  window.removeEventListener('mouseup', endSwap);
  // Ein Zug, der nicht beim Loslassen endet (das Fenster geht fort), lässt den
  // Baum sonst mit einem Zeiger auf ein Fenster zurück, das es nicht mehr gibt.
  if (swapping.value) desktop.cancelTileSwap();
}
</script>

<template>
  <section
    class="window-frame"
    :class="{ full, tiled: !!tile, swapping }"
    :style="frameStyle"
    @mousedown="focus"
  >
    <!-- Vollflächige Schutzschicht: verhindert, dass die iframes beim Ziehen/
         Größenändern (und beim Tauschen) die Maus schlucken. -->
    <div v-if="interacting" class="drag-shield"></div>

    <!-- Hier landet die getragene Kachel, wenn jetzt losgelassen wird. -->
    <div v-if="dropTarget" class="drop-target" aria-hidden="true"></div>

    <!-- Im Einzel-Modus trägt die Kopfzeile KEINE Fensterknöpfe (es gibt dort
         keinen Fenstermanager), sondern nur den Weg zurück zum Desktop. -->
    <header class="titlebar" @mousedown.self="startTitleDrag" @dblclick="!single && toggleMaximize()">
      <button v-if="single" type="button" class="w-desktop" title="Zurück zum Desktop" @mousedown.stop @click="backToDesktop">
        ← Desktop
      </button>
      <slot name="icon">
        <AppIcon class="w-icon" :icon="win.icon" :size="16" @mousedown.stop />
      </slot>
      <span class="w-title" @mousedown.self="startTitleDrag">
        <slot name="title">{{ win.title }}</slot>
      </span>
      <BusyDot v-if="agentBusy" class="w-busy" @mousedown.stop />
      <span class="w-actions">
        <slot name="actions" />
        <template v-if="!single">
          <button type="button" class="w-min" title="Minimieren" @mousedown.stop @click="minimize">—</button>
          <button
            type="button"
            class="w-max"
            :title="win.maximized ? 'Wiederherstellen' : 'Maximieren'"
            @mousedown.stop
            @click="toggleMaximize"
          >
            {{ win.maximized ? '❐' : '▢' }}
          </button>
          <button type="button" class="w-close" title="Schließen" @mousedown.stop @click="close">✕</button>
        </template>
      </span>
    </header>

    <div class="w-body">
      <slot />
    </div>

    <!-- Der Chat der App, wenn sie ihn gerade zeigt: eine Leiste am unteren
         Rand DIESES Fensters, über der App statt neben ihr. -->
    <footer v-if="$slots.composer" class="w-composer">
      <slot name="composer" />
    </footer>

    <div v-if="movable" class="resize-handle" title="Größe ändern" @mousedown.stop="startResize"></div>
  </section>
</template>

<style scoped>
.window-frame {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 240px;
  min-height: 160px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  pointer-events: auto;
}
/*
 * Gekachelt: Der Baum teilt die Fläche lückenlos auf — eine Mindestgröße dürfte
 * dem nicht dazwischenkommen, sonst überlappten sich schmale Kacheln doch
 * wieder. Die Kachel bleibt am Platz; wie klein sie werden darf, begrenzt beim
 * Ziehen an der Fuge der Baum selbst (MIN_TILE, c0067).
 */
.window-frame.tiled {
  min-width: 0;
  min-height: 0;
}
/* Getragen: Das Fenster bleibt an seinem Platz, hebt sich aber ab — es hängt
   am Zeiger und wartet auf die Kachel, mit der es tauscht (c0067). */
.window-frame.swapping {
  opacity: 0.7;
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}
/* Der Hinweis auf der Zielkachel — nur zu sehen, nicht anzufassen. */
.drop-target {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  border: 2px solid var(--accent);
  border-radius: 12px;
  background: rgba(108, 140, 255, 0.16);
}
/* Vollflächig: maximiert oder Einzel-Modus. */
.window-frame.full {
  inset: 0;
  width: auto;
  height: auto;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.window-frame.full .titlebar {
  cursor: default;
}
.drag-shield {
  position: fixed;
  inset: 0;
  z-index: 9999;
  cursor: grabbing;
}
.titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;
}
.w-desktop {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.w-desktop:hover {
  border-color: var(--accent);
}
/* Das Icon, wenn der Aufsatz keines mitbringt. */
.w-icon {
  font-size: 16px;
}
.w-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: grab;
}
.w-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* Auch die Knöpfe, die ein Aufsatz beisteuert (:slotted), sehen gleich aus. */
.w-actions button,
.w-actions :slotted(button) {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 7px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}
.w-actions button:hover,
.w-actions :slotted(button:hover) {
  border-color: var(--border);
  color: var(--text);
}
.w-close:hover {
  border-color: var(--danger) !important;
  color: #ffb3b3 !important;
}
.w-body {
  position: relative;
  flex: 1;
  overflow: hidden;
  /* Dunkler Untergrund für den Entwurf/WelcomeScreen; die laufende App bringt
     ihren eigenen (weißen) Hintergrund über das iframe mit (AppCanvas). */
  background: var(--panel);
}
/* Arbeitsanzeige neben dem Fenstertitel. */
.w-busy {
  margin-right: 2px;
}
/*
 * Die Composer-Leiste liegt ÜBER dem unteren Teil der App, statt sie zu
 * verkleinern: Ein Fenster, das sich beim Aufklappen des Chats umbaut, wäre
 * unruhig — und der Verlauf darin bekommt so eine Grenze, an der er rollt,
 * statt aus dem Rahmen zu wachsen.
 */
.w-composer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  max-height: 60%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: var(--panel);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.45);
}
/* Der Griff bleibt greifbar, auch wenn die Composer-Leiste darunter liegt. */
.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 7;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--border) 50%, var(--border) 60%, transparent 60%, transparent 75%, var(--border) 75%);
}
</style>
