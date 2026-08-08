<script setup lang="ts">
import AppIcon from './AppIcon.vue';

/**
 * Der Fensterwechsler: eine Reihe von Kacheln über dem Desktop, solange
 * Strg/⌘ + Tab gehalten wird. Die Auswahl steht als Prop — gehalten,
 * weitergerückt und beim Loslassen aktiviert wird sie vom Desktop
 * (views/DesktopView); die Reihenfolge kommt aus core/switcher.
 */

/** Ein wählbares Fenster (DesktopWindow passt darauf). */
interface SwitchableWindow {
  instanceId: string;
  title: string;
  icon: string;
}

const props = defineProps<{ windows: readonly SwitchableWindow[]; index: number }>();
const emit = defineEmits<{ pick: [instanceId: string] }>();
</script>

<template>
  <div class="sw-backdrop">
    <div class="sw-panel" role="dialog" aria-modal="true" aria-label="Fenster wechseln">
      <ul class="sw-list">
        <li
          v-for="(w, i) in props.windows"
          :key="w.instanceId"
          class="sw-item"
          :class="{ active: i === props.index }"
          :aria-selected="i === props.index"
          @click="emit('pick', w.instanceId)"
        >
          <AppIcon class="sw-icon" :icon="w.icon" :size="40" />
          <span class="sw-name">{{ w.title }}</span>
        </li>
      </ul>
      <p class="sw-title">{{ props.windows[props.index]?.title ?? '' }}</p>
    </div>
  </div>
</template>

<style scoped>
.sw-backdrop {
  position: absolute;
  inset: 0;
  z-index: 16000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 7, 10, 0.45);
  /* Gehalten wird der Wechsler über die Tastatur — die Maus greift durch,
     außer auf die Kacheln selbst. */
  pointer-events: none;
}
.sw-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 88%;
  padding: 14px 16px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  pointer-events: auto;
}
.sw-list {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  max-width: 100%;
  overflow-x: auto;
  list-style: none;
}
.sw-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 96px;
  padding: 10px 6px;
  border: 1px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  user-select: none;
}
.sw-item.active {
  background: var(--panel-2);
  border-color: var(--accent);
}
.sw-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--muted);
}
.sw-item.active .sw-name {
  color: var(--text);
}
.sw-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
