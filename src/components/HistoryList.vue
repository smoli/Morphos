<script setup lang="ts">
import type { VersionInfo } from '@/types';

// Versionen kommen aus der Git-Historie: neueste zuerst (HEAD = aktiver Stand).
defineProps<{ versions: VersionInfo[]; activeSha: string | null }>();
const emit = defineEmits<{ select: [sha: string] }>();

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
</script>

<template>
  <div class="history">
    <p v-if="versions.length === 0" class="empty">Noch keine Versionen vorhanden.</p>
    <ul v-else>
      <li
        v-for="version in versions"
        :key="version.sha"
        :class="{ active: version.sha === activeSha }"
        @click="emit('select', version.sha)"
      >
        <div class="prompt">{{ version.prompt }}</div>
        <div class="time">{{ fmt(version.time) }}</div>
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
