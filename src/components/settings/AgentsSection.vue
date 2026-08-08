<script setup lang="ts">
/** Einstellungs-Bereich „Agenten“: Deckel gleichzeitiger Agentenläufe. */
import { useWorkspaceStore } from '@/stores/workspace';
import { MAX_AGENTS_LIMIT } from '@/core/queue';

const workspace = useWorkspaceStore();

// Deckel gleichzeitiger Agenten: 1 … MAX_AGENTS_LIMIT.
const AGENT_COUNTS = Array.from({ length: MAX_AGENTS_LIMIT }, (_, i) => i + 1);

function setMaxAgents(count: number): void {
  workspace.setMaxAgents(count);
}
</script>

<template>
  <section class="block">
    <h3>Agenten (gleichzeitige Läufe)</h3>
    <p class="hint">
      Wie viele Wünsche gleichzeitig bearbeitet werden dürfen. Alles darüber wartet in der
      Reihenfolge des Eingangs — für eine App arbeitet ohnehin nie mehr als ein Agent.
    </p>
    <div class="agents-setting">
      <span class="seg">
        <button
          v-for="n in AGENT_COUNTS"
          :key="n"
          type="button"
          :class="{ active: workspace.maxAgents === n }"
          @click="setMaxAgents(n)"
        >
          {{ n }}
        </button>
      </span>
    </div>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.agents-setting {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
