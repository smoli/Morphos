<script setup lang="ts">
/**
 * Einstellungs-Bereich „Arbeitsverzeichnis“: der Ordner, in dem die Apps dieses
 * Desktops liegen — je App ein Unterordner mit eigenem Git-Repository.
 *
 * Von hier aus geht er dorthin auf, wo der Anwender selbst damit arbeitet: in
 * den Dateimanager des Systems oder in ein Terminal (c0075). Geöffnet wird im
 * Hauptprozess; fehlt die Anbindung (Renderer-Test, Browser), bleiben die
 * Knöpfe aus.
 */
import { ref } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { getHost } from '@/services/host';

const workspace = useWorkspaceStore();
const host = getHost();

const canReveal = typeof host.revealFolder === 'function';
const canTerminal = typeof host.openTerminal === 'function';

const error = ref<string | null>(null);
const busy = ref(false);

async function run(open: () => Promise<{ ok: boolean; error?: string }>): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const res = await open();
    if (!res.ok) error.value = res.error ?? 'Das ließ sich nicht öffnen.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="block">
    <h3>Arbeitsverzeichnis</h3>
    <p class="hint">
      Der Ordner dieses Desktops: Jede App liegt darin als eigener Unterordner mit eigener
      Versionsgeschichte. Von außen zu öffnen lohnt sich für alles, was Morphos nicht selbst tut —
      etwa eine App zu einer Gegenstelle zu schieben.
    </p>

    <p v-if="workspace.folder" class="folder-path" :title="workspace.folder">
      🗂 <code>{{ workspace.folder }}</code>
    </p>
    <p v-else class="muted">Kein Arbeitsverzeichnis geöffnet.</p>

    <div class="actions">
      <button
        type="button"
        class="btn reveal"
        :disabled="!workspace.folder || !canReveal || busy"
        @click="run(() => workspace.revealFolder())"
      >
        Im Dateimanager öffnen
      </button>
      <button
        type="button"
        class="btn terminal"
        :disabled="!workspace.folder || !canTerminal || busy"
        @click="run(() => workspace.openTerminal())"
      >
        Im Terminal öffnen
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.folder-path {
  margin: 0 0 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn:disabled:hover {
  border-color: var(--border);
}
.error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #ffb3b3;
}
</style>
