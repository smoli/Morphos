<script setup lang="ts">
/** Einstellungs-Bereich „Berechtigungen“: Dateizugriff je Funktion. */
import { useWorkspaceStore } from '@/stores/workspace';
import { FS_OP_LABELS } from '@/core/permissions';
import type { FsOp, PermMode } from '@/types';

const workspace = useWorkspaceStore();

const FS_OPS: FsOp[] = ['read', 'list', 'exists', 'stat', 'write', 'mkdir', 'delete'];
const PERM_MODES: { mode: PermMode; label: string }[] = [
  { mode: 'ask', label: 'Fragen' },
  { mode: 'allow', label: 'Erlauben' },
  { mode: 'deny', label: 'Ablehnen' },
];

function setPerm(op: FsOp, mode: PermMode): void {
  workspace.setPermission(op, mode);
}
</script>

<template>
  <section class="block">
    <h3>Berechtigungen der Apps (Dateizugriff)</h3>
    <p class="hint">
      Lege je Funktion fest, ob eine App fragen muss, still darf oder abgelehnt wird.
    </p>
    <ul class="perms">
      <li v-for="op in FS_OPS" :key="op">
        <span class="op">{{ FS_OP_LABELS[op] }}</span>
        <span class="seg">
          <button
            v-for="m in PERM_MODES"
            :key="m.mode"
            type="button"
            :class="{ active: workspace.permissionFor(op) === m.mode }"
            @click="setPerm(op, m.mode)"
          >
            {{ m.label }}
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.perms {
  list-style: none;
  margin: 0;
  padding: 0;
}
.perms li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-top: 1px solid var(--border);
}
.op {
  color: var(--muted);
  font-size: 13px;
}
</style>
