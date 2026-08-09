<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { menuPos, type MenuItem } from '@/core/menu';

/**
 * Das Kontextmenü der Schale — überall gleich: eine Liste von Einträgen, die
 * dort aufklappt, wo der Anwender mit der rechten Maustaste geklickt hat. Wer
 * es öffnet, gibt die Einträge und die Stelle vor und hört auf `pick`;
 * geschlossen wird es beim Auswählen, mit Escape und bei jedem Klick daneben.
 * Genutzt von den Desktop-Icons (Öffnen, Icon, Dock, Löschen) und vom Dock.
 */
const props = defineProps<{ items: readonly MenuItem[]; x: number; y: number }>();
const emit = defineEmits<{ pick: [id: string]; close: [] }>();

const root = ref<HTMLElement | null>(null);
// Erst gemessen weiß das Menü, ob es am Rand kippen muss (siehe core/menu).
const size = ref({ w: 0, h: 0 });

const pos = computed(() =>
  menuPos({ x: props.x, y: props.y }, size.value, { w: window.innerWidth, h: window.innerHeight }),
);

function onMouseDown(e: MouseEvent): void {
  if (!root.value?.contains(e.target as Node)) emit('close');
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  emit('close');
}

onMounted(() => {
  const el = root.value;
  if (el) size.value = { w: el.offsetWidth, h: el.offsetHeight };
  // In der Erfassungsphase: Das Menü geht zu, bevor das Geklickte reagiert.
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('keydown', onKeyDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onMouseDown, true);
  window.removeEventListener('keydown', onKeyDown, true);
});
</script>

<template>
  <ul ref="root" class="ctx" role="menu" :style="{ left: `${pos.x}px`, top: `${pos.y}px` }">
    <li v-for="item in items" :key="item.id" role="none" :class="{ sep: item.separator }">
      <button
        type="button"
        class="ctx-item"
        :class="{ danger: item.danger }"
        role="menuitem"
        @click="emit('pick', item.id)"
      >
        <span v-if="item.icon" class="ctx-icon" aria-hidden="true">{{ item.icon }}</span>
        <span class="ctx-label">{{ item.label }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.ctx {
  position: fixed;
  z-index: 20000;
  min-width: 180px;
  margin: 0;
  padding: 5px;
  list-style: none;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
/* Eine Trennlinie über dem Eintrag setzt ihn von den übrigen ab. */
.sep {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--border);
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  border-radius: 7px;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.ctx-item:hover,
.ctx-item:focus-visible {
  background: var(--panel-2);
  outline: none;
}
.ctx-item.danger {
  color: #ffb3b3;
}
.ctx-item.danger:hover,
.ctx-item.danger:focus-visible {
  background: rgba(255, 108, 108, 0.14);
}
.ctx-icon {
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}
.ctx-label {
  white-space: nowrap;
}
</style>
