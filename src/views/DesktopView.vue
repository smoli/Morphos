<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkspaceStore } from '@/stores/workspace';
import { FS_OP_LABELS } from '@/core/permissions';
import type { FsOp, PermMode } from '@/types';

const workspace = useWorkspaceStore();
const router = useRouter();

const FS_OPS: FsOp[] = ['read', 'list', 'exists', 'stat', 'write', 'mkdir', 'delete'];
const PERM_MODES: { mode: PermMode; label: string }[] = [
  { mode: 'ask', label: 'Fragen' },
  { mode: 'allow', label: 'Erlauben' },
  { mode: 'deny', label: 'Ablehnen' },
];

function setPerm(op: FsOp, mode: PermMode): void {
  workspace.setPermission(op, mode);
}

onMounted(() => {
  void workspace.refresh();
});

function openApp(id: string): void {
  void router.push(`/app/${id}`);
}

function newApp(): void {
  void router.push('/app/new');
}

function setAccessFolder(): void {
  void workspace.setAccessFolder();
}

async function removeApp(id: string, name: string): Promise<void> {
  if (!confirm(`App „${name}“ wirklich löschen?`)) return;
  await workspace.removeApp(id);
}
</script>

<template>
  <div class="desktop">
    <div class="access-bar">
      <span class="access-info">
        <span v-if="workspace.accessRoot" class="access-path" :title="workspace.accessRoot">
          📂 Datenordner der Apps: <code>{{ workspace.accessRoot }}</code>
        </span>
        <span v-else class="muted">📂 Kein Datenordner festgelegt — Apps können (noch) nichts dauerhaft speichern.</span>
      </span>
      <button type="button" class="access-btn" @click="setAccessFolder">
        {{ workspace.accessRoot ? 'Ändern …' : 'Festlegen …' }}
      </button>
    </div>

    <details class="perms">
      <summary>Berechtigungen der Apps (Dateisystem)</summary>
      <p class="perms-hint">
        Lege je Funktion fest, ob eine App fragen muss, still darf oder abgelehnt wird.
        „Fragen“ zeigt beim Aufruf einen Dialog; dort lässt sich die Wahl dauerhaft merken.
      </p>
      <ul>
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
    </details>

    <div v-if="workspace.loading && workspace.apps.length === 0" class="loading">Apps werden geladen …</div>

    <div class="grid">
      <button type="button" class="tile new" @click="newApp">
        <span class="icon">＋</span>
        <span class="name">Neue App</span>
      </button>

      <div v-for="app in workspace.apps" :key="app.id" class="tile-wrap">
        <button type="button" class="tile" @click="openApp(app.id)" :title="app.name">
          <span class="icon">{{ app.icon }}</span>
          <span class="name">{{ app.name }}</span>
          <span class="meta">{{ app.versions }} Version(en)</span>
        </button>
        <button type="button" class="del" title="Löschen" @click.stop="removeApp(app.id, app.name)">🗑</button>
      </div>
    </div>

    <p v-if="!workspace.loading && workspace.apps.length === 0" class="hint">
      Noch keine Apps in diesem Verzeichnis. Erstelle deine erste App über „Neue App“.
    </p>
  </div>
</template>

<style scoped>
.desktop {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
}
.access-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 13px;
}
.access-info {
  overflow: hidden;
}
.access-path {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.access-path code {
  color: var(--text);
}
.muted {
  color: var(--muted);
}
.access-btn {
  flex-shrink: 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 14px;
  border-radius: 9px;
  font-size: 13px;
  cursor: pointer;
}
.access-btn:hover {
  border-color: var(--accent);
}
.perms {
  margin-bottom: 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 6px 14px;
  font-size: 13px;
}
.perms summary {
  cursor: pointer;
  padding: 6px 0;
  color: var(--text);
}
.perms-hint {
  color: var(--muted);
  margin: 4px 0 12px;
  line-height: 1.5;
}
.perms ul {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
}
.perms li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}
.op {
  color: var(--muted);
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
.loading {
  color: var(--muted);
  text-align: center;
  padding: 16px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}
.tile-wrap {
  position: relative;
}
.tile {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 16px;
  cursor: pointer;
  padding: 12px;
  transition: border-color 0.15s, transform 0.1s;
}
.tile:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.tile.new {
  border-style: dashed;
  color: var(--muted);
}
.icon {
  font-size: 42px;
  line-height: 1;
}
.name {
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.meta {
  font-size: 11px;
  color: var(--muted);
}
.del {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(15, 17, 21, 0.7);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 8px;
  padding: 3px 6px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.tile-wrap:hover .del {
  opacity: 1;
}
.del:hover {
  border-color: var(--danger);
  color: #ffb3b3;
}
.hint {
  color: var(--muted);
  text-align: center;
  margin-top: 32px;
  font-size: 14px;
}
</style>
