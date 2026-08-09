<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAppWindow } from '@/stores/app';
import { useDesktopStore } from '@/stores/desktop';
import { useWorkspaceStore } from '@/stores/workspace';
import { useAgentsStore } from '@/stores/agents';
import { agentBusyIcon, agentBusyLabel } from '@/core/agent';
import { useElapsed } from '@/composables/useElapsed';
import { useSetAppIcon } from '@/composables/useSetAppIcon';
import WindowFrame from './WindowFrame.vue';
import AppCanvas from './AppCanvas.vue';
import ChatDock from './ChatDock.vue';
import WelcomeScreen from './WelcomeScreen.vue';
import HistoryList from './HistoryList.vue';
import DocsPanel from './DocsPanel.vue';
import AppIcon from './AppIcon.vue';
import IconDialog from './IconDialog.vue';
import { shortcutKeys } from '@/core/shortcuts';
import type { DesktopWindow } from '@/stores/desktop';
import type { Attachment } from '@/types';

/**
 * Ein Fenster, das eine erzeugte App zeigt: der Instanz-Store, die App im
 * Canvas, Versionen, Dokumente, das Icon — und der Chat zu dieser App, der auf
 * Zuruf unten am Fenster erscheint. Den Rahmen — Geometrie, Ziehen,
 * Fensterknöpfe — stellt WindowFrame; hier liegt nur, was die App angeht.
 */
const props = defineProps<{ win: DesktopWindow; single?: boolean }>();

const desktop = useDesktopStore();
const workspace = useWorkspaceStore();
const agents = useAgentsStore();
const store = useAppWindow(props.win.instanceId);
const setAppIcon = useSetAppIcon();

const showVersions = ref(false);
const showDocs = ref(false);
const showIcon = ref(false);

// Die Warteanzeige führt den Lauf vor, ohne dass der Chat aufklappen muss: was
// der Agent gerade tut plus die mitlaufende Laufzeit (ein Schritt kann lange
// derselbe bleiben — die Zeit zeigt, dass es weitergeht).
const busyIcon = computed(() => agentBusyIcon(store.activity));
const busyLabel = computed(() => agentBusyLabel(store.activity));
const elapsed = useElapsed(() => store.runStartedAt);

// Wieviele Wünsche stehen für dieses Fenster noch an?
const queuedHere = computed(
  () => agents.queuedJobs.filter((j) => j.instanceId === props.win.instanceId).length,
);
// Ein Lauf für DIESE App, der nicht in diesem Fenster begonnen hat (das
// ursprüngliche ist zugegangen): Die Anzeige hier wäre sonst stumm, obwohl sich
// die App gleich ändert.
const runningElsewhere = computed(
  () => !store.busy && !!props.win.appId && agents.runningJobs.some((j) => j.appKey === props.win.appId),
);

onMounted(async () => {
  // Hält der Store diese App schon, wird die Ansicht nur wieder eingeblendet
  // (Einzel-Modus: zurück vom Desktop). Neu laden hieße hier: den Stand der
  // Platte über einen laufenden Lauf legen — Verlauf und Fortschritt wären weg.
  if (props.win.appId && store.id === props.win.appId) {
    syncMeta();
  } else if (props.win.appId && workspace.folder) {
    await store.open(workspace.folder, props.win.appId);
    syncMeta();
  } else if (workspace.folder && !store.folder) {
    store.newDraft(workspace.folder);
  }
});

onBeforeUnmount(() => {
  // Nur ein wirklich geschlossenes Fenster gibt seinen Zustand auf. Im
  // Einzel-Modus verschwindet die Ansicht auch beim Wechsel zum Desktop oder zu
  // einer anderen App — das Fenster (und sein Agent) läuft dann weiter.
  if (!desktop.find(props.win.instanceId)) store.$dispose();
});

/** Titel/Icon des Fensters mit der (ggf. umbenannten) App abgleichen. */
function syncMeta(): void {
  if (store.id) desktop.setAppMeta(props.win.instanceId, store.id, store.name, store.icon);
}

// Jeder Wunsch dieses Fensters — aus dem Chat oder vom WelcomeScreen eines
// leeren Entwurfs — geht in die zentrale Warteschlange (siehe stores/agents).
function onPrompt(text: string, attachments: Attachment[] = []): void {
  agents.submit(props.win.instanceId, text, attachments);
}

const chatTitle = computed(
  () => `${store.composerOpen ? 'Chat schließen' : 'Chat öffnen'} (${shortcutKeys('composer')})`,
);

// Versionen und Dokumente legen sich beide über die App — es liegt also stets
// höchstens eine der beiden Ansichten oben.
function toggleVersions(): void {
  showVersions.value = !showVersions.value;
  if (showVersions.value) showDocs.value = false;
}
function toggleDocs(): void {
  showDocs.value = !showDocs.value;
  if (showDocs.value) showVersions.value = false;
}

async function onRevert(sha: string): Promise<void> {
  await store.revertTo(sha);
  showVersions.value = false;
}

/** Neues Icon aus dem Dialog: auf die Platte, in die Kachel und in dieses Fenster. */
async function onIcon(icon: string | null): Promise<void> {
  if (!store.id) return;
  if (await setAppIcon(store.id, icon)) showIcon.value = false;
}
</script>

<template>
  <WindowFrame :win="win" :single="single">
    <!-- Das Icon der App ist zugleich der Weg zum Icon-Dialog. -->
    <template #icon>
      <button
        v-if="!store.isDraft"
        type="button"
        class="w-icon w-icon-btn"
        title="Icon ändern"
        @mousedown.stop
        @click="showIcon = true"
      >
        <AppIcon :icon="store.icon || win.icon" :size="16" />
      </button>
      <AppIcon v-else class="w-icon" :icon="store.icon || win.icon" :size="16" @mousedown.stop />
    </template>

    <template #title>{{ store.name || win.title }}</template>

    <template #actions>
      <button
        type="button"
        class="w-chat"
        :class="{ on: store.composerOpen }"
        :title="chatTitle"
        @mousedown.stop
        @click="store.toggleComposer()"
      >
        💬
      </button>
      <button
        v-if="!store.isDraft"
        type="button"
        class="w-docs"
        title="Konzept und Anleitung"
        @mousedown.stop
        @click="toggleDocs"
      >
        📄
      </button>
      <button
        v-if="!store.isDraft"
        type="button"
        class="w-versions"
        title="Versionen"
        @mousedown.stop
        @click="toggleVersions"
      >
        ⟲ {{ store.versionCount }}
      </button>
    </template>

    <!-- Der Chat dieser App — nur, wenn er gerade offen steht. Escape schließt
         ihn auch aus dem Eingabefeld heraus (dort gilt kein Tastenkürzel). -->
    <template v-if="store.composerOpen" #composer>
      <ChatDock
        :busy="store.busy"
        :messages="store.chat"
        :pending-question="store.pendingQuestion"
        :activity="store.activity"
        :started-at="store.runStartedAt"
        :queued="queuedHere"
        @submit="onPrompt"
        @keydown.esc.stop="store.closeComposer()"
      />
    </template>

    <AppCanvas
      v-if="store.hasApp"
      :html="store.currentHtml"
      :access-root="workspace.accessRoot"
      :authorize="workspace.authorizeFs"
    />
    <WelcomeScreen v-else @pick="onPrompt" />

    <div v-if="store.busy || runningElsewhere" class="w-loading">
      <div class="spinner"></div>
      <div>{{ store.hasApp ? 'Die Änderung wird umgesetzt …' : 'Die Anwendung wird entwickelt …' }}</div>
      <template v-if="store.busy">
        <div class="w-step" :title="busyLabel">
          <span class="w-step-icon">{{ busyIcon }}</span>
          <span class="w-step-label">{{ busyLabel }}</span>
        </div>
        <div v-if="elapsed" class="w-elapsed">{{ elapsed }}</div>
      </template>
      <div v-if="queuedHere" class="w-queued">
        {{ queuedHere === 1 ? 'Ein weiterer Wunsch wartet.' : `${queuedHere} weitere Wünsche warten.` }}
      </div>
    </div>

    <div v-if="store.error" class="w-error">{{ store.error }}</div>

    <div v-if="showVersions" class="w-versions-panel">
      <div class="w-versions-head">
        <span>Versionen</span>
        <button type="button" @click="showVersions = false">Schließen</button>
      </div>
      <HistoryList :versions="store.versions" :active-sha="store.activeSha" @select="onRevert" />
    </div>

    <DocsPanel v-if="showDocs" :docs="store.docs" @close="showDocs = false" />

    <IconDialog
      v-if="showIcon"
      :name="store.name || win.title"
      :icon="store.icon || win.icon"
      :custom="store.iconCustom"
      @close="showIcon = false"
      @apply="onIcon"
    />
  </WindowFrame>
</template>

<style scoped>
.w-icon {
  font-size: 16px;
}
/* Das Icon ist zugleich der Weg zum Icon-Dialog. */
.w-icon-btn {
  display: flex;
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 2px;
  cursor: pointer;
}
.w-icon-btn:hover {
  border-color: var(--border);
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
  padding: 0 24px;
  box-sizing: border-box;
  text-align: center;
}
/* Der laufende Schritt — dieselbe Meldung, die der Chat im Verlauf zeigt. */
.w-step {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: -6px;
  font-size: 13px;
  max-width: 100%;
}
.w-step-icon {
  flex-shrink: 0;
  font-size: 12px;
}
.w-step-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-elapsed {
  margin-top: -8px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.w-queued {
  font-size: 12px;
  opacity: 0.7;
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
/* Der 💬-Knopf zeigt, ob der Chat offen steht. */
.w-chat.on {
  border-color: var(--accent) !important;
  color: var(--text) !important;
}
/*
 * Die Meldung sitzt oben: Unten liegt der Chat, und gerade dann, wenn ein Lauf
 * schiefgeht, will man beides gleichzeitig sehen.
 */
.w-error {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 10px;
  background: rgba(40, 12, 12, 0.95);
  border: 1px solid var(--danger);
  color: #ffb3b3;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 12px;
  white-space: pre-wrap;
  z-index: 5;
}
</style>
