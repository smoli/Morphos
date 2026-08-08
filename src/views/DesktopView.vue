<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import { useAgentsStore } from '@/stores/agents';
import { useAppWindow } from '@/stores/app';
import { useSetAppIcon } from '@/composables/useSetAppIcon';
import WindowFrame from '@/components/WindowFrame.vue';
import ChatDock from '@/components/ChatDock.vue';
import BusyDot from '@/components/BusyDot.vue';
import AppIcon from '@/components/AppIcon.vue';
import IconDialog from '@/components/IconDialog.vue';
import type { AppSummary, Attachment } from '@/types';

const workspace = useWorkspaceStore();
const desktop = useDesktopStore();
const agents = useAgentsStore();
const setAppIcon = useSetAppIcon();

const singleMode = computed(() => workspace.uiMode === 'single');

// Im Einzel-Modus wird nur das aktive Fenster (Vollbild) gezeigt — oder gar
// keines, solange der Anwender über „← Desktop“ beim Launcher ist.
const activeWindow = computed(() =>
  desktop.windows.find((w) => w.instanceId === desktop.activeId) ?? null,
);

// Dock: im Fenster-Modus die minimierten Fenster; im Einzel-Modus auf dem
// Desktop alle laufenden Apps (auch Entwürfe ohne Kachel) zum Zurückwechseln.
// Läuft dort eine App im Vollbild, verdeckt kein Dock ihre Fläche.
const dockWindows = computed(() => {
  if (!singleMode.value) return desktop.windows.filter((w) => w.minimized);
  return activeWindow.value ? [] : desktop.windows;
});

// Die globale Promptleiste ist an das aktive Fenster gebunden.
const activeStore = computed(() => (desktop.activeId ? useAppWindow(desktop.activeId) : null));
const chatMessages = computed(() => activeStore.value?.chat ?? []);
const chatBusy = computed(() => activeStore.value?.busy ?? false);
const chatPending = computed(() => activeStore.value?.pendingQuestion ?? null);
const chatActivity = computed(() => activeStore.value?.activity ?? []);
const chatStartedAt = computed(() => activeStore.value?.runStartedAt ?? null);
// Wie viele Wünsche für das aktive Fenster noch anstehen (sie laufen nacheinander).
const chatQueued = computed(() =>
  desktop.activeId
    ? agents.queuedJobs.filter((j) => j.instanceId === desktop.activeId).length
    : 0,
);

/** Arbeitet ein Agent für dieses Fenster (bzw. für die App, die es zeigt)? */
function windowBusy(instanceId: string, appId: string | null): boolean {
  return agents.isWindowBusy(instanceId, appId);
}

// Anzeigen, an welche App die Eingabe geht (Gewissheit für den Anwender). Ohne
// aktives Fenster entsteht eine neue App. Im Einzel-Modus zeigt die laufende
// App ihren Namen bereits in der Kopfzeile — dort genügt der Hinweis auf dem
// Desktop.
const chatContext = computed<string | null>(() => {
  const w = activeWindow.value;
  if (singleMode.value) return w ? null : 'Neue App';
  return w ? w.title : 'Neue App';
});
// Das Icon separat: Es kann ein Bild sein und lässt sich dann nicht in den Text setzen.
const chatContextIcon = computed<string | null>(() => {
  if (singleMode.value) return null;
  return activeWindow.value?.icon ?? null;
});

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
  agents.submitToActive(text, attachments);
}

// ---- Icon einer App ändern (Dialog von der Kachel aus) ----
const iconAppId = ref<string | null>(null);
const iconApp = computed<AppSummary | null>(
  () => workspace.apps.find((a) => a.id === iconAppId.value) ?? null,
);

async function applyIcon(icon: string | null): Promise<void> {
  const id = iconAppId.value;
  if (!id) return;
  if (await setAppIcon(id, icon)) iconAppId.value = null;
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
              <AppIcon class="icon" :icon="app.icon" :size="42" />
              <span class="name">{{ app.name }}</span>
              <span class="meta">{{ app.versions }} Version(en)</span>
            </button>
            <BusyDot v-if="agents.isBusy(app.id)" class="tile-busy" />
            <span class="tile-actions">
              <button type="button" class="act" title="Icon ändern" @click.stop="iconAppId = app.id">⚙</button>
              <button type="button" class="act del" title="Löschen" @click.stop="removeApp(app.id, app.name)">🗑</button>
            </span>
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

      <!-- Dock für minimierte bzw. (Einzel-Modus) laufende Fenster. -->
      <div v-if="dockWindows.length" class="dock">
        <button
          v-for="w in dockWindows"
          :key="w.instanceId"
          type="button"
          class="dock-item"
          :title="w.title"
          @click="desktop.restoreWindow(w.instanceId)"
        >
          <AppIcon :icon="w.icon" :size="16" />
          <span class="dock-name">{{ w.title }}</span>
          <BusyDot v-if="windowBusy(w.instanceId, w.appId)" />
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
        :context-label="chatContext"
        :context-icon="chatContextIcon"
        :activity="chatActivity"
        :started-at="chatStartedAt"
        :queued="chatQueued"
        @submit="onPrompt"
      />
    </footer>

    <IconDialog
      v-if="iconApp"
      :name="iconApp.name"
      :icon="iconApp.icon"
      :custom="iconApp.iconCustom"
      @close="iconAppId = null"
      @apply="applyIcon"
    />
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
/* Arbeitsanzeige der Kachel — links oben, gegenüber dem Löschknopf. */
.tile-busy {
  position: absolute;
  top: 10px;
  left: 10px;
}
.tile-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.tile-wrap:hover .tile-actions,
.tile-actions:focus-within {
  opacity: 1;
}
.act {
  background: rgba(15, 17, 21, 0.7);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 8px;
  padding: 3px 6px;
  font-size: 12px;
  cursor: pointer;
}
.act:hover {
  border-color: var(--accent);
  color: var(--text);
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
