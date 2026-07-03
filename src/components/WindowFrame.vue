<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAppWindow } from '@/stores/app';
import { useDesktopStore } from '@/stores/desktop';
import { useWorkspaceStore } from '@/stores/workspace';
import AppCanvas from './AppCanvas.vue';
import WelcomeScreen from './WelcomeScreen.vue';
import HistoryList from './HistoryList.vue';
import type { DesktopWindow } from '@/stores/desktop';
import type { Attachment } from '@/types';

const props = defineProps<{ win: DesktopWindow; single?: boolean }>();

const desktop = useDesktopStore();
const workspace = useWorkspaceStore();
const store = useAppWindow(props.win.instanceId);

const showVersions = ref(false);
const interacting = ref(false); // Ziehen/Größe ändern → Schutzschicht über den iframes

// Vollflächig (kein Ziehen/Größe): im Einzel-Modus oder wenn maximiert.
const full = computed(() => props.single || props.win.maximized);

onMounted(async () => {
  if (props.win.appId && workspace.folder) {
    await store.open(workspace.folder, props.win.appId);
    syncMeta();
  } else if (workspace.folder && !store.folder) {
    store.newDraft(workspace.folder);
  }
});

onBeforeUnmount(() => {
  stopInteraction();
  store.$dispose();
});

/** Titel/Icon des Fensters mit der (ggf. umbenannten) App abgleichen. */
function syncMeta(): void {
  if (store.id) desktop.setAppMeta(props.win.instanceId, store.id, store.name, store.icon);
}

function focus(): void {
  desktop.focusWindow(props.win.instanceId);
}
function close(): void {
  desktop.closeWindow(props.win.instanceId);
}
function minimize(): void {
  desktop.minimizeWindow(props.win.instanceId);
}
function toggleMaximize(): void {
  desktop.toggleMaximize(props.win.instanceId);
}

// Der WelcomeScreen eines leeren Entwurfsfensters generiert über die zentrale
// Orchestrierung (wie die globale Promptleiste).
async function onWelcomePick(text: string, attachments: Attachment[] = []): Promise<void> {
  await desktop.runGenerate(props.win.instanceId, text, attachments);
}

async function onRevert(sha: string): Promise<void> {
  await store.revertTo(sha);
  showVersions.value = false;
}

// ---- Ziehen (Titelleiste) ----
let dragDX = 0;
let dragDY = 0;
function startDrag(e: MouseEvent): void {
  focus();
  interacting.value = true;
  dragDX = e.clientX - props.win.x;
  dragDY = e.clientY - props.win.y;
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopInteraction);
}
function onDrag(e: MouseEvent): void {
  desktop.moveWindow(props.win.instanceId, e.clientX - dragDX, e.clientY - dragDY);
}

// ---- Größe ändern (Griff unten rechts) ----
let resW = 0;
let resH = 0;
let resX = 0;
let resY = 0;
function startResize(e: MouseEvent): void {
  focus();
  interacting.value = true;
  resW = props.win.w;
  resH = props.win.h;
  resX = e.clientX;
  resY = e.clientY;
  window.addEventListener('mousemove', onResize);
  window.addEventListener('mouseup', stopInteraction);
}
function onResize(e: MouseEvent): void {
  desktop.resizeWindow(props.win.instanceId, resW + (e.clientX - resX), resH + (e.clientY - resY));
}

function stopInteraction(): void {
  interacting.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mousemove', onResize);
  window.removeEventListener('mouseup', stopInteraction);
}
</script>

<template>
  <section
    class="window-frame"
    :class="{ full }"
    :style="full ? { zIndex: win.z } : { left: win.x + 'px', top: win.y + 'px', width: win.w + 'px', height: win.h + 'px', zIndex: win.z }"
    @mousedown="focus"
  >
    <!-- Vollflächige Schutzschicht: verhindert, dass die iframes beim Ziehen/
         Größenändern die Maus schlucken. -->
    <div v-if="interacting" class="drag-shield"></div>

    <header class="titlebar" @mousedown.self="!full && startDrag($event)" @dblclick="!single && toggleMaximize()">
      <span class="w-icon" @mousedown.stop>{{ store.icon || win.icon }}</span>
      <span class="w-title" @mousedown.self="!full && startDrag($event)">{{ store.name || win.title }}</span>
      <span class="w-actions">
        <button
          v-if="!store.isDraft"
          type="button"
          class="w-versions"
          title="Versionen"
          @mousedown.stop
          @click="showVersions = !showVersions"
        >
          ⟲ {{ store.versionCount }}
        </button>
        <button type="button" class="w-min" title="Minimieren" @mousedown.stop @click="minimize">—</button>
        <button
          v-if="!single"
          type="button"
          class="w-max"
          :title="win.maximized ? 'Wiederherstellen' : 'Maximieren'"
          @mousedown.stop
          @click="toggleMaximize"
        >
          {{ win.maximized ? '❐' : '▢' }}
        </button>
        <button type="button" class="w-close" title="Schließen" @mousedown.stop @click="close">✕</button>
      </span>
    </header>

    <div class="w-body">
      <AppCanvas
        v-if="store.hasApp"
        :html="store.currentHtml"
        :access-root="workspace.accessRoot"
        :authorize="workspace.authorizeFs"
      />
      <WelcomeScreen v-else @pick="onWelcomePick" />

      <div v-if="store.busy" class="w-loading">
        <div class="spinner"></div>
        <div>{{ store.hasApp ? 'Die Änderung wird umgesetzt …' : 'Die Anwendung wird entwickelt …' }}</div>
      </div>

      <div v-if="store.error" class="w-error">{{ store.error }}</div>

      <div v-if="showVersions" class="w-versions-panel">
        <div class="w-versions-head">
          <span>Versionen</span>
          <button type="button" @click="showVersions = false">Schließen</button>
        </div>
        <HistoryList :versions="store.versions" :active-sha="store.activeSha" @select="onRevert" />
      </div>
    </div>

    <div v-if="!full" class="resize-handle" title="Größe ändern" @mousedown.stop="startResize"></div>
  </section>
</template>

<style scoped>
.window-frame {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 240px;
  min-height: 160px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  pointer-events: auto;
}
/* Vollflächig: maximiert oder Einzel-Modus. */
.window-frame.full {
  inset: 0;
  width: auto;
  height: auto;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.window-frame.full .titlebar {
  cursor: default;
}
.drag-shield {
  position: fixed;
  inset: 0;
  z-index: 9999;
  cursor: grabbing;
}
.titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;
}
.w-icon {
  font-size: 16px;
}
.w-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: grab;
}
.w-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.w-actions button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 7px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}
.w-actions button:hover {
  border-color: var(--border);
  color: var(--text);
}
.w-close:hover {
  border-color: var(--danger) !important;
  color: #ffb3b3 !important;
}
.w-body {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: #fff;
}
.w-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(15, 17, 21, 0.82);
  color: var(--muted);
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.w-versions-panel {
  position: absolute;
  inset: 0;
  background: var(--panel);
  display: flex;
  flex-direction: column;
}
.w-versions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.w-versions-head button {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.w-error {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  background: rgba(40, 12, 12, 0.95);
  border: 1px solid var(--danger);
  color: #ffb3b3;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 12px;
  white-space: pre-wrap;
  z-index: 5;
}
.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--border) 50%, var(--border) 60%, transparent 60%, transparent 75%, var(--border) 75%);
}
</style>
