<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import { useAppWindow } from '@/stores/app';
import WindowFrame from '@/components/WindowFrame.vue';
import ChatDock from '@/components/ChatDock.vue';
import type { AppSummary, Attachment } from '@/types';

const workspace = useWorkspaceStore();
const desktop = useDesktopStore();

const singleMode = computed(() => workspace.uiMode === 'single');
const minimized = computed(() => desktop.windows.filter((w) => w.minimized));

// Im Einzel-Modus wird nur das aktive Fenster (Vollbild) gezeigt.
const activeWindow = computed(() =>
  desktop.windows.find((w) => w.instanceId === desktop.focusedId) ?? null,
);

// Die globale Promptleiste ist an das aktive Fenster gebunden.
const activeStore = computed(() => (desktop.focusedId ? useAppWindow(desktop.focusedId) : null));
const chatMessages = computed(() => activeStore.value?.chat ?? []);
const chatBusy = computed(() => activeStore.value?.busy ?? false);
const chatPending = computed(() => activeStore.value?.pendingQuestion ?? null);

onMounted(() => {
  void workspace.refresh();
});

function openApp(app: AppSummary): void {
  desktop.openApp(app.id, { title: app.name, icon: app.icon });
}
function newApp(): void {
  desktop.openDraft();
}
async function removeApp(id: string, name: string): Promise<void> {
  if (!confirm(`App „${name}“ wirklich löschen?`)) return;
  const open = desktop.windows.find((w) => w.appId === id);
  if (open) desktop.closeWindow(open.instanceId);
  await workspace.removeApp(id);
}

function onPrompt(text: string, attachments: Attachment[] = []): void {
  void desktop.submitToActive(text, attachments);
}
</script>

<template>
  <div class="desktop">
    <div class="stage">
      <!-- Launcher: Icons der Apps (liegt hinter den Fenstern). -->
      <div class="launcher">
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
          Noch keine Apps in diesem Verzeichnis. Beschreibe unten, was deine erste App sein soll —
          oder öffne „Neue App“.
        </p>
      </div>

      <!-- Fenster-Ebene. -->
      <div class="windows-layer">
        <template v-if="singleMode">
          <WindowFrame v-if="activeWindow" :key="activeWindow.instanceId" :win="activeWindow" :single="true" />
        </template>
        <template v-else>
          <WindowFrame v-for="w in desktop.stacked" v-show="!w.minimized" :key="w.instanceId" :win="w" />
        </template>
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

    <!-- Globale Promptleiste — immer für das aktive Fenster. -->
    <footer class="prompt-wrap">
      <div v-if="activeStore?.error" class="error">{{ activeStore.error }}</div>
      <ChatDock
        :busy="chatBusy"
        :messages="chatMessages"
        :pending-question="chatPending"
        @submit="onPrompt"
      />
    </footer>
  </div>
</template>

<style scoped>
.desktop {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
}
.stage {
  position: relative;
  overflow: hidden;
}
.launcher {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 24px;
}
.windows-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
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
.prompt-wrap {
  border-top: 1px solid var(--border);
  background: var(--panel);
  padding: 12px 16px;
}
.error {
  background: rgba(255, 108, 108, 0.12);
  border: 1px solid var(--danger);
  color: #ffb3b3;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 10px;
  font-size: 13px;
  white-space: pre-wrap;
}
</style>
