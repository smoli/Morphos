<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { filterItems, launcherItems, nextIndex, type LauncherItem } from '@/core/launcher';
import type { AppSummary } from '@/types';

/**
 * Das Startmenü der Shell: eine Suchleiste über dem Desktop, mit der sich eine
 * App tippend finden und öffnen lässt — für Verzeichnisse, in denen zu viele
 * Kacheln liegen, um sie mit dem Auge zu durchsuchen.
 *
 * Bedient wird alles über die Tastatur: tippen filtert, ↑/↓ wandern durch die
 * Treffer, die Eingabetaste öffnet den hervorgehobenen (eine laufende App holt
 * der Desktop dann nur in den Vordergrund), Escape schließt. „Neue App“ ist ein
 * Eintrag wie jeder andere (siehe core/launcher).
 */
const props = defineProps<{ apps: readonly AppSummary[] }>();
const emit = defineEmits<{ close: []; open: [appId: string]; new: [] }>();

const query = ref('');
const index = ref(0);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const items = computed(() => launcherItems(props.apps));
const hits = computed(() => filterItems(items.value, query.value));

// Ein neuer Suchtext (oder eine gelöschte App) fängt beim besten Treffer an.
watch(hits, () => {
  index.value = 0;
});

function move(delta: number): void {
  index.value = nextIndex(index.value, delta, hits.value.length);
  void scrollActiveIntoView();
}

/** Der hervorgehobene Treffer bleibt beim Wandern sichtbar. */
async function scrollActiveIntoView(): Promise<void> {
  await nextTick();
  const active = list.value?.querySelector<HTMLElement>('.lp-item.active');
  // Der Aufruf fehlt in jsdom (Tests) — dort gibt es nichts zu rollen.
  active?.scrollIntoView?.({ block: 'nearest' });
}

function choose(item: LauncherItem | undefined): void {
  if (!item) return;
  if (item.kind === 'new') emit('new');
  else emit('open', item.id);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    move(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    move(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choose(hits.value[index.value]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}

onMounted(() => input.value?.focus());
</script>

<template>
  <div class="lp-backdrop" @mousedown.self="emit('close')">
    <div class="lp-panel" role="dialog" aria-modal="true" aria-label="Apps suchen">
      <input
        ref="input"
        v-model="query"
        class="lp-input"
        type="text"
        placeholder="App suchen …"
        aria-label="App suchen"
        autocomplete="off"
        spellcheck="false"
        @keydown="onKey"
      />

      <ul ref="list" class="lp-list">
        <li
          v-for="(item, i) in hits"
          :key="item.id"
          class="lp-item"
          :class="{ active: i === index, new: item.kind === 'new' }"
          @mousemove="index = i"
          @click="choose(item)"
        >
          <AppIcon class="lp-icon" :icon="item.icon" :size="22" />
          <span class="lp-name">{{ item.name }}</span>
        </li>
      </ul>

      <p v-if="!hits.length" class="lp-empty">Keine App passt zu „{{ query }}“.</p>
      <p class="lp-hint">↑↓ wählen · ⏎ öffnen · Esc schließen</p>
    </div>
  </div>
</template>

<style scoped>
.lp-backdrop {
  position: absolute;
  inset: 0;
  z-index: 15000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(6, 7, 10, 0.55);
  backdrop-filter: blur(2px);
}
.lp-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(520px, 92%);
  max-height: 70%;
  padding: 14px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}
.lp-input {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 16px;
}
.lp-input:focus {
  outline: none;
  border-color: var(--accent);
}
.lp-list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.lp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
}
.lp-item.active {
  background: var(--panel-2);
  border-color: var(--accent);
}
.lp-item.new .lp-name {
  color: var(--muted);
}
.lp-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lp-empty {
  margin: 0;
  padding: 6px 10px;
  color: var(--muted);
  font-size: 13px;
}
.lp-hint {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  text-align: right;
}
</style>
