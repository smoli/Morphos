<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAgentsStore } from '@/stores/agents';

/**
 * Die Agentenanzeige der Titelleiste: eine Zahl (laufende + wartende Läufe) und
 * dahinter, aufklappbar, die Liste — je Auftrag die App, ob er läuft oder
 * wartet, und ein Knopf zum Abbrechen.
 */
const agents = useAgentsStore();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const count = computed(() => agents.count);
const busy = computed(() => count.value > 0);

const label = computed(() => {
  const running = agents.runningJobs.length;
  const queued = agents.queuedJobs.length;
  if (!busy.value) return 'Zurzeit arbeitet kein Agent.';
  const parts = [`${running} laufend`];
  if (queued) parts.push(`${queued} wartend`);
  return `Agenten: ${parts.join(', ')}`;
});

// Ist der letzte Auftrag erledigt, hat die Liste nichts mehr zu zeigen.
watch(count, (n) => { if (n === 0) open.value = false; });

function onDocumentClick(e: MouseEvent): void {
  if (!open.value) return;
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('mousedown', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick));
</script>

<template>
  <div ref="root" class="agents">
    <button
      type="button"
      class="agents-btn"
      :class="{ busy }"
      :title="label"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="agents-icon">⚡</span>
      <span class="agents-count">{{ count }}</span>
    </button>

    <div v-if="open" class="agents-popover">
      <div class="agents-head">{{ label }}</div>
      <p v-if="!busy" class="agents-empty">Beschreibe unten einen Wunsch — er läuft dann hier auf.</p>
      <ul v-else class="agents-list">
        <li v-for="job in agents.jobs" :key="job.jobId" class="agents-row">
          <span class="agents-state" :class="job.state">{{ job.state === 'running' ? '▶' : '⏸' }}</span>
          <span class="agents-app" :title="job.prompt">
            <span class="agents-name">{{ job.label }}</span>
            <span class="agents-prompt">{{ job.prompt }}</span>
          </span>
          <button
            type="button"
            class="agents-cancel"
            :title="job.state === 'running' ? 'Lauf abbrechen' : 'Aus der Warteschlange nehmen'"
            @click="agents.cancel(job.jobId)"
          >
            ✕
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.agents {
  position: relative;
}
.agents-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 9px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
.agents-btn:hover {
  border-color: var(--accent);
}
.agents-btn.busy {
  color: var(--text);
  border-color: var(--accent);
}
.agents-icon {
  font-size: 12px;
}
.agents-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.agents-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  padding: 10px;
  z-index: 15000;
  cursor: default;
}
.agents-head {
  font-size: 12px;
  color: var(--muted);
  padding: 2px 4px 8px;
}
.agents-empty {
  margin: 0;
  padding: 4px;
  font-size: 12px;
  color: var(--muted);
}
.agents-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.agents-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 6px 8px;
}
.agents-state {
  font-size: 10px;
  color: var(--muted);
  flex-shrink: 0;
}
.agents-state.running {
  color: var(--accent);
}
.agents-app {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.agents-name {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agents-prompt {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agents-cancel {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 7px;
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
}
.agents-cancel:hover {
  border-color: var(--danger);
  color: #ffb3b3;
}
</style>
