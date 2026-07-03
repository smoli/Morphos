<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import WindowFrame from '@/components/WindowFrame.vue';
import { FS_OP_LABELS } from '@/core/permissions';
import type { AppSummary, FsOp, PermMode } from '@/types';

const workspace = useWorkspaceStore();
const desktop = useDesktopStore();

const minimized = computed(() => desktop.windows.filter((w) => w.minimized));

const newLibPattern = ref('');

function addLibPattern(): void {
  workspace.addLibPattern(newLibPattern.value);
  newLibPattern.value = '';
}

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

function openApp(app: AppSummary): void {
  desktop.openApp(app.id, { title: app.name, icon: app.icon });
}

function newApp(): void {
  desktop.openDraft();
}

function setAccessFolder(): void {
  void workspace.setAccessFolder();
}

async function removeApp(id: string, name: string): Promise<void> {
  if (!confirm(`App „${name}“ wirklich löschen?`)) return;
  // Ein offenes Fenster dieser App schließen, bevor sie verschwindet.
  const open = desktop.windows.find((w) => w.appId === id);
  if (open) desktop.closeWindow(open.instanceId);
  await workspace.removeApp(id);
}
</script>

<template>
  <div class="desktop">
    <div class="desk-content">
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

    <details class="perms libs">
      <summary>Bibliotheken der Apps (freigegebene Quellen)</summary>
      <p class="perms-hint">
        Apps dürfen JavaScript-Bibliotheken nur von diesen Quellen einbinden — als Hostname
        (<code>cdn.jsdelivr.net</code>) oder https-URL-Präfix (<code>https://unpkg.com/</code>).
        Die Shell lädt eine Bibliothek einmalig, cacht sie und bettet sie offline ein;
        die laufende App hat weiterhin keinen Netzwerkzugriff.
      </p>
      <ul>
        <li v-for="pattern in workspace.libWhitelist" :key="pattern" class="lib-row">
          <code class="lib-pattern">{{ pattern }}</code>
          <button type="button" class="lib-del" title="Freigabe entziehen" @click="workspace.removeLibPattern(pattern)">✕</button>
        </li>
      </ul>
      <p v-if="workspace.libWhitelist.length === 0" class="perms-hint">
        Noch keine Quelle freigegeben — Apps können keine Bibliotheken nutzen.
      </p>
      <form class="lib-add" @submit.prevent="addLibPattern">
        <input v-model="newLibPattern" type="text" placeholder="cdn.jsdelivr.net oder https://…" />
        <button type="submit" :disabled="!newLibPattern.trim()">Freigeben</button>
      </form>
    </details>

    <div v-if="workspace.loading && workspace.apps.length === 0" class="loading">Apps werden geladen …</div>

    <div class="grid">
      <button type="button" class="tile new" @click="newApp">
        <span class="icon">＋</span>
        <span class="name">Neue App</span>
      </button>

      <div v-for="app in workspace.apps" :key="app.id" class="tile-wrap">
        <button type="button" class="tile" @click="openApp(app)" :title="app.name">
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

    <!-- Fenster-Ebene: liegt über dem Launcher; nur die Fenster fangen Klicks. -->
    <div class="windows-layer">
      <WindowFrame v-for="w in desktop.stacked" v-show="!w.minimized" :key="w.instanceId" :win="w" />
    </div>

    <!-- Dock für minimierte Fenster. -->
    <div v-if="minimized.length" class="dock">
      <button
        v-for="w in minimized"
        :key="w.instanceId"
        type="button"
        class="dock-item"
        :title="w.title"
        @click="desktop.restoreWindow(w.instanceId)"
      >
        <span>{{ w.icon }}</span>
        <span class="dock-name">{{ w.title }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.desktop {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.desk-content {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 24px;
}
/* Fenster schweben über dem Launcher; die Ebene selbst fängt keine Klicks,
   nur die Fenster (pointer-events in WindowFrame gesetzt). */
.windows-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.dock {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 6px;
  background: rgba(20, 22, 28, 0.9);
  border: 1px solid var(--border);
  border-radius: 14px;
  z-index: 10000;
  max-width: 90%;
  overflow-x: auto;
}
.dock-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.dock-item:hover {
  border-color: var(--accent);
}
.dock-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
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
.lib-row {
  gap: 8px;
}
.lib-pattern {
  color: var(--text);
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
  padding: 8px 0 10px;
}
.lib-add input {
  flex: 1;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
}
.lib-add button {
  background: var(--accent);
  border: 0;
  color: #fff;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.lib-add button:disabled {
  opacity: 0.5;
  cursor: default;
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
