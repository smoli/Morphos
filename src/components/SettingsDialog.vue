<script setup lang="ts">
import { ref } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { FS_OP_LABELS } from '@/core/permissions';
import type { FsOp, PermMode } from '@/types';

const emit = defineEmits<{ close: [] }>();

const workspace = useWorkspaceStore();

const FS_OPS: FsOp[] = ['read', 'list', 'exists', 'stat', 'write', 'mkdir', 'delete'];
const PERM_MODES: { mode: PermMode; label: string }[] = [
  { mode: 'ask', label: 'Fragen' },
  { mode: 'allow', label: 'Erlauben' },
  { mode: 'deny', label: 'Ablehnen' },
];

const newLibPattern = ref('');

function setPerm(op: FsOp, mode: PermMode): void {
  workspace.setPermission(op, mode);
}
function setAccessFolder(): void {
  void workspace.setAccessFolder();
}
function addLibPattern(): void {
  workspace.addLibPattern(newLibPattern.value);
  newLibPattern.value = '';
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Einstellungen">
      <header class="head">
        <h2>Einstellungen</h2>
        <button type="button" class="close" title="Schließen" @click="emit('close')">✕</button>
      </header>

      <div class="body">
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(6, 7, 10, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  padding: 24px;
}
.dialog {
  width: min(680px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.head h2 {
  margin: 0;
  font-size: 16px;
}
.close {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 9px;
  padding: 5px 10px;
  cursor: pointer;
}
.close:hover {
  border-color: var(--danger);
  color: #ffb3b3;
}
.body {
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.block h3 {
  margin: 0 0 6px;
  font-size: 14px;
}
.hint {
  color: var(--muted);
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
}
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
.muted {
  color: var(--muted);
  font-size: 13px;
}
.btn {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 9px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn:hover {
  border-color: var(--accent);
}
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
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.seg button {
  background: var(--panel-2);
  border: 0;
  border-left: 1px solid var(--border);
  color: var(--muted);
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.seg button:first-child {
  border-left: 0;
}
.seg button.active {
  background: var(--accent);
  color: #fff;
}
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
