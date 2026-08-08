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
 */
const props = defineProps<{ win: DesktopWindow; single?: boolean }>();

const desktop = useDesktopStore();
const agents = useAgentsStore();

const interacting = ref(false); // Ziehen/Größe ändern → Schutzschicht über den iframes

// Vollflächig (kein Ziehen/Größe): im Einzel-Modus oder wenn maximiert.
const full = computed(() => props.single || props.win.maximized);

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

function stopInteraction(): void {
  interacting.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mousemove', onResize);
  window.removeEventListener('mouseup', stopInteraction);
}
</script>

<template>
  <section
    class="window-frame"
    :class="{ full }"
    :style="full ? { zIndex: win.z } : { left: win.x + 'px', top: win.y + 'px', width: win.w + 'px', height: win.h + 'px', zIndex: win.z }"
    @mousedown="focus"
  >
    <!-- Vollflächige Schutzschicht: verhindert, dass die iframes beim Ziehen/
         Größenändern die Maus schlucken. -->
    <div v-if="interacting" class="drag-shield"></div>

    <!-- Im Einzel-Modus trägt die Kopfzeile KEINE Fensterknöpfe (es gibt dort
         keinen Fenstermanager), sondern nur den Weg zurück zum Desktop. -->
    <header class="titlebar" @mousedown.self="!full && startDrag($event)" @dblclick="!single && toggleMaximize()">
      <button v-if="single" type="button" class="w-desktop" title="Zurück zum Desktop" @mousedown.stop @click="backToDesktop">
        ← Desktop
      </button>
      <slot name="icon">
        <AppIcon class="w-icon" :icon="win.icon" :size="16" @mousedown.stop />
      </slot>
      <span class="w-title" @mousedown.self="!full && startDrag($event)">
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

    <div v-if="!full" class="resize-handle" title="Größe ändern" @mousedown.stop="startResize"></div>
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
.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--border) 50%, var(--border) 60%, transparent 60%, transparent 75%, var(--border) 75%);
}
</style>
