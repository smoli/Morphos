<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useWorkspaceStore } from '@/stores/workspace';
import { getHost } from '@/services/host';
import AgentsIndicator from './AgentsIndicator.vue';
import type { UiMode } from '@/types';

const emit = defineEmits<{ 'open-settings': [] }>();

const route = useRoute();
const workspace = useWorkspaceStore();

const onDesktop = computed(() => route.name === 'desktop');
const brandTarget = computed(() => (workspace.hasFolder ? '/desktop' : '/'));

// Unter macOS zeichnet das OS die (nativen) Ampel-Knöpfe links; wir lassen dort
// Platz und rendern KEINE eigenen Fensterknöpfe. Unter Windows/Linux zeichnen
// wir die Knöpfe rechts selbst.
const isMac = (() => {
  try {
    return getHost().platform === 'darwin';
  } catch {
    return false;
  }
})();

const maximized = ref(false);
let offMaximize: (() => void) | undefined;

onMounted(async () => {
  try {
    maximized.value = (await getHost().isWindowMaximized?.()) ?? false;
    offMaximize = getHost().onWindowMaximize?.((v) => { maximized.value = v; });
  } catch {
    /* im Browser/Test ohne Fensteranbindung */
  }
});
onBeforeUnmount(() => offMaximize?.());

function folderName(p: string | null): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

function setMode(mode: UiMode): void {
  workspace.setUiMode(mode);
}

function minimize(): void {
  void getHost().minimizeWindow?.();
}
function toggleMaximize(): void {
  void getHost().toggleMaximizeWindow?.();
}
function closeWindow(): void {
  void getHost().closeWindow?.();
}
</script>

<template>
  <header class="topbar" :class="{ mac: isMac }">
    <div class="left">
      <RouterLink :to="brandTarget" class="brand no-drag">
        <span class="logo">◈</span>
        <span>
          <span class="brand-name">Morphos</span>
          <span class="brand-sub">Die App, die sich selbst entwickelt</span>
        </span>
      </RouterLink>
    </div>

    <div class="center">
      <template v-if="onDesktop">
        <span class="folder no-drag" :title="workspace.folder ?? ''">📁 {{ folderName(workspace.folder) }}</span>
      </template>
    </div>

    <div class="right no-drag">
      <template v-if="onDesktop">
        <div class="mode-switch" role="group" aria-label="Darstellungsmodus">
          <button type="button" :class="{ active: workspace.uiMode === 'windows' }" @click="setMode('windows')">
            ▦ Fenster
          </button>
          <button type="button" :class="{ active: workspace.uiMode === 'single' }" @click="setMode('single')">
            ▢ Einzeln
          </button>
        </div>
        <AgentsIndicator />
        <button type="button" class="icon-btn settings" title="Einstellungen" @click="emit('open-settings')">⚙</button>
        <RouterLink to="/" class="link">Ordner wechseln</RouterLink>
      </template>

      <div v-if="!isMac" class="win-controls">
        <button type="button" class="win-btn" title="Minimieren" @click="minimize">─</button>
        <button type="button" class="win-btn" :title="maximized ? 'Wiederherstellen' : 'Maximieren'" @click="toggleMaximize">
          {{ maximized ? '❐' : '▢' }}
        </button>
        <button type="button" class="win-btn close" title="Schließen" @click="closeWindow">✕</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 0 14px;
  height: 44px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  /* Der ganze Balken zieht das rahmenlose Fenster; interaktive Elemente heben das auf. */
  -webkit-app-region: drag;
}
/* Unter macOS Platz für die nativen Ampel-Knöpfe links lassen. */
.topbar.mac {
  padding-left: 84px;
}
.no-drag {
  -webkit-app-region: no-drag;
}
.left,
.center,
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.center {
  flex: 1;
  justify-content: center;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}
.logo {
  font-size: 20px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-name {
  display: block;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.3px;
}
.brand-sub {
  display: block;
  font-size: 11px;
  color: var(--muted);
}
.folder {
  font-size: 13px;
  color: var(--muted);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mode-switch {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 9px;
  overflow: hidden;
}
.mode-switch button {
  background: var(--panel-2);
  border: 0;
  border-left: 1px solid var(--border);
  color: var(--muted);
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
.mode-switch button:first-child {
  border-left: 0;
}
.mode-switch button.active {
  background: var(--accent);
  color: #fff;
}
.icon-btn {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 9px;
  padding: 6px 10px;
  font-size: 14px;
  cursor: pointer;
}
.icon-btn:hover {
  border-color: var(--accent);
}
.link {
  color: var(--text);
  text-decoration: none;
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 9px;
  font-size: 12px;
}
.link:hover {
  border-color: var(--accent);
}
.win-controls {
  display: flex;
  align-items: stretch;
  height: 44px;
  margin-left: 4px;
}
.win-btn {
  width: 46px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}
.win-btn:hover {
  background: var(--panel-2);
  color: var(--text);
}
.win-btn.close:hover {
  background: #c4342f;
  color: #fff;
}
</style>
