<script setup lang="ts">
/** Einstellungs-Bereich „Bibliotheken“: freigegebene Quellen für JS-Bibliotheken. */
import { ref } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';

const workspace = useWorkspaceStore();

const newLibPattern = ref('');

function addLibPattern(): void {
  workspace.addLibPattern(newLibPattern.value);
  newLibPattern.value = '';
}
</script>

<template>
  <section class="block">
    <h3>Bibliotheken (freigegebene Quellen)</h3>
    <p class="hint">
      Apps dürfen JavaScript-Bibliotheken nur von diesen Quellen einbinden — als Hostname
      (<code>cdn.jsdelivr.net</code>) oder https-URL-Präfix (<code>https://unpkg.com/</code>).
      Die Shell lädt sie einmalig, cacht sie und bettet sie offline ein.
    </p>
    <ul class="libs">
      <li v-for="pattern in workspace.libWhitelist" :key="pattern" class="lib-row">
        <code class="lib-pattern">{{ pattern }}</code>
        <button type="button" class="lib-del" title="Freigabe entziehen" @click="workspace.removeLibPattern(pattern)">✕</button>
      </li>
    </ul>
    <p v-if="workspace.libWhitelist.length === 0" class="muted">
      Noch keine Quelle freigegeben — Apps können keine Bibliotheken nutzen.
    </p>
    <form class="lib-add" @submit.prevent="addLibPattern">
      <input v-model="newLibPattern" type="text" placeholder="cdn.jsdelivr.net oder https://…" />
      <button type="submit" :disabled="!newLibPattern.trim()">Freigeben</button>
    </form>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.libs {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
}
.lib-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}
.lib-pattern {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lib-del {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 7px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
.lib-del:hover {
  border-color: var(--danger);
  color: #ffb3b3;
}
.lib-add {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}
.lib-add input {
  flex: 1;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
}
.lib-add button {
  background: var(--accent);
  border: 0;
  color: #fff;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}
.lib-add button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
