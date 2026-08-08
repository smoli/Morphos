<script setup lang="ts">
/** Einstellungs-Bereich „Datenordner“: gemeinsamer Zugriffsordner der Apps. */
import { useWorkspaceStore } from '@/stores/workspace';

const workspace = useWorkspaceStore();

function setAccessFolder(): void {
  void workspace.setAccessFolder();
}
</script>

<template>
  <section class="block">
    <h3>Datenordner der Apps</h3>
    <p class="hint">
      Gemeinsamer Ordner, in den die erzeugten Apps lesen und schreiben dürfen.
    </p>
    <div class="access">
      <span v-if="workspace.accessRoot" class="path" :title="workspace.accessRoot">
        📂 <code>{{ workspace.accessRoot }}</code>
      </span>
      <span v-else class="muted">Kein Datenordner festgelegt — Apps können nichts dauerhaft speichern.</span>
      <button type="button" class="btn" @click="setAccessFolder">
        {{ workspace.accessRoot ? 'Ändern …' : 'Festlegen …' }}
      </button>
    </div>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.access {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  font-size: 13px;
}
</style>
