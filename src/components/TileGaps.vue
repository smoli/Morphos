<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useDesktopStore } from '@/stores/desktop';
import { gapBands, type GapHit } from '@/core/tiling';

/**
 * Die Griffe an den Fugen des Kachel-Verbunds (c0067): An jeder Fuge zwischen
 * zwei Kacheln lässt sich ziehen, und die Teilung dahinter folgt — begrenzt auf
 * die Mindestgröße einer Kachel (core/tiling → stores/desktop.dragGap).
 *
 * Die Schicht liegt über den Fenstern, nimmt aber nur an den Fugen Klicks an;
 * gezogen wird über einer Schutzschicht, sonst schluckten die iframes der Apps
 * die Maus. Wo gerade eine Kachel getragen wird (Tauschen) oder ein Fenster
 * maximiert die Fläche füllt, gibt es keine Fuge zu fassen.
 */

/** Ein paar Bildpunkte Zugabe auf jeder Seite: Die Fuge wird so zu einem Griff,
 *  den man nicht erst suchen muss — auch eine sehr schmale (c0072). */
const GRAB = 4;

const desktop = useDesktopStore();

// Welche Fuge gerade am Zeiger hängt (null: keine). Ihr Streifen veraltet beim
// Ziehen — gebraucht werden nur Pfad und Richtung.
const dragging = ref<GapHit | null>(null);

const blocked = computed(
  () => !!desktop.tileSwap || desktop.windows.some((w) => w.maximized && !w.minimized),
);

const bands = computed<GapHit[]>(() =>
  blocked.value ? [] : gapBands(desktop.tileTree, desktop.tileArea, desktop.tileGap),
);

/** Ein Pfad als Schlüssel — die Wurzel hat den leeren. */
function bandKey(hit: GapHit): string {
  return hit.path.join('') || 'root';
}

/** Hängt diese Fuge gerade am Zeiger? */
function isDragging(hit: GapHit): boolean {
  return !!dragging.value && bandKey(dragging.value) === bandKey(hit);
}

/** Der Griff deckt die Fuge ab, quer dazu ein Stück breiter (GRAB). */
function bandStyle(hit: GapHit) {
  const b = hit.band;
  const quer = hit.orientation === 'row';
  return {
    left: `${b.x - (quer ? GRAB : 0)}px`,
    top: `${b.y - (quer ? 0 : GRAB)}px`,
    width: `${b.w + (quer ? 2 * GRAB : 0)}px`,
    height: `${b.h + (quer ? 0 : 2 * GRAB)}px`,
  };
}

function startDrag(e: MouseEvent, hit: GapHit): void {
  if (e.button !== 0) return;
  dragging.value = hit;
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
}

function onDrag(e: MouseEvent): void {
  const hit = dragging.value;
  if (hit) desktop.dragGap(hit.path, desktop.stagePoint(e));
}

function stopDrag(): void {
  dragging.value = null;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <div class="tile-gaps">
    <!-- Schutzschicht: Während des Ziehens sieht die Maus nur noch uns, nicht
         die iframes der laufenden Apps. -->
    <div v-if="dragging" class="drag-shield" :class="dragging.orientation"></div>

    <div
      v-for="hit in bands"
      :key="bandKey(hit)"
      class="gap-handle"
      :class="[hit.orientation, { dragging: isDragging(hit) }]"
      :style="bandStyle(hit)"
      title="Teilung verschieben"
      @mousedown="startDrag($event, hit)"
    ></div>
  </div>
</template>

<style scoped>
/*
 * Über den Fenstern (deren z-index bei 1 anfängt), aber unter dem Dock (10000):
 * Die Griffe müssen über den Kacheln liegen, sonst käme man an die Fuge nur bis
 * zum ersten Fenster heran. Angefasst wird trotzdem nur, was hier drinsteht.
 */
.tile-gaps {
  position: absolute;
  inset: 0;
  z-index: 9000;
  pointer-events: none;
}
.gap-handle {
  position: absolute;
  pointer-events: auto;
}
.gap-handle.row {
  cursor: col-resize;
}
.gap-handle.column {
  cursor: row-resize;
}
/*
 * Die Fuge zeigt sich, sobald man sie anfasst — vorher ist sie nur Luft. Der
 * Strich liegt mittig in der Fuge (4 px), nicht auf den Kacheln daneben.
 */
.gap-handle:hover::after,
.gap-handle.dragging::after {
  content: '';
  position: absolute;
  border-radius: 2px;
  background: var(--accent);
  opacity: 0.55;
}
.gap-handle.row:hover::after,
.gap-handle.row.dragging::after {
  inset: 8px calc(50% - 2px);
}
.gap-handle.column:hover::after,
.gap-handle.column.dragging::after {
  inset: calc(50% - 2px) 8px;
}
/* Sie trägt den Zeiger der Fuge weiter, an der gerade gezogen wird. */
.drag-shield {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}
.drag-shield.row {
  cursor: col-resize;
}
.drag-shield.column {
  cursor: row-resize;
}
</style>
