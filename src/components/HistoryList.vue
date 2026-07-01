<script setup lang="ts">
import type { HistoryEntry } from '@/types';

defineProps<{ entries: HistoryEntry[]; activeId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
</script>

<template>
  <div class="history">
    <p v-if="entries.length === 0" class="empty">Noch keine Versionen vorhanden.</p>
    <ul v-else>
      <li
        v-for="entry in [...entries].reverse()"
        :key="entry.id"
        :class="{ active: entry.id === activeId }"
        @click="emit('select', entry.id)"
      >
        <div class="prompt">{{ entry.prompt }}</div>
        <div class="time">{{ fmt(entry.time) }}</div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.history {
  height: 100%;
  overflow-y: auto;
}
.empty {
  color: var(--muted);
  padding: 16px;
  text-align: center;
}
ul {
  list-style: none;
  margin: 0;
  padding: 8px;
}
li {
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  background: var(--panel-2);
  transition: border-color 0.15s;
}
li:hover {
  border-color: var(--accent);
}
li.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.prompt {
  font-size: 13px;
  line-height: 1.4;
}
.time {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}
</style>
