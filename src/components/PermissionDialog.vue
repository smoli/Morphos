<script setup lang="ts">
import { computed } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { FS_OP_LABELS } from '@/core/permissions';
import type { PermDecision } from '@/types';

const workspace = useWorkspaceStore();

const pending = computed(() => workspace.pendingPermission);
const label = computed(() => (pending.value ? FS_OP_LABELS[pending.value.op] : ''));

function answer(decision: PermDecision): void {
  workspace.answerPermission(decision);
}
</script>

<template>
  <div v-if="pending" class="overlay">
    <div class="dialog" role="dialog" aria-modal="true">
      <h3>Zugriff erlauben?</h3>
      <p class="desc">
        Eine App möchte <strong>{{ label }}</strong>:
      </p>
      <p class="path"><code>{{ pending.path || '(Datenordner)' }}</code></p>

      <div class="actions">
        <button type="button" class="allow" @click="answer('allow-once')">Einmal erlauben</button>
        <button type="button" class="allow always" @click="answer('allow-always')">Immer erlauben</button>
        <button type="button" class="deny" @click="answer('deny-once')">Einmal ablehnen</button>
        <button type="button" class="deny always" @click="answer('deny-always')">Immer ablehnen</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(9, 10, 13, 0.6);
  backdrop-filter: blur(2px);
}
.dialog {
  width: min(440px, 92vw);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
}
h3 {
  margin: 0 0 10px;
  font-size: 17px;
}
.desc {
  margin: 0 0 6px;
  color: var(--muted);
}
.path {
  margin: 0 0 18px;
  word-break: break-all;
}
.path code {
  color: var(--text);
  background: var(--panel-2);
  padding: 3px 7px;
  border-radius: 7px;
  font-size: 13px;
}
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
button {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
  background: var(--panel-2);
}
.allow {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
}
.allow.always {
  filter: brightness(0.92);
}
.deny:hover {
  border-color: var(--danger);
  color: #ffb3b3;
}
.always {
  font-weight: 600;
}
</style>
