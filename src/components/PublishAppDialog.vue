<script setup lang="ts">
import { ref } from 'vue';

/**
 * „App veröffentlichen…“ (c0083): Eine App, die nur hier liegt, bekommt zum
 * ersten Mal eine Gegenstelle — damit sie sich teilen lässt.
 *
 * Der Dialog fragt nur nach der Adresse; eingetragen und geschoben wird im
 * Hauptprozess. Zwei Dinge muss er dabei deutlich sagen, sonst wartet der
 * Anwender auf etwas, das nicht kommt:
 *
 * - Das Repository legt Morphos NICHT an. Dafür bräuchte es einen Zugang zur
 *   API der Plattform und damit einen Schlüssel im Haus; der Anwender legt es
 *   dort an, wo er ohnehin angemeldet ist.
 * - Es muss LEER sein. Die Historie einer App ist eine eigene Kette
 *   vollständiger Schnappschüsse — über eine fremde ginge sie nur mit Gewalt.
 */
const props = defineProps<{
  /** Um welche App es geht (sie steht im Text). */
  appName: string;
  /** Läuft das Veröffentlichen? Dann ist der Dialog nur noch zum Zusehen da. */
  busy: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ close: []; submit: [url: string] }>();

const url = ref('');

function submit(): void {
  const value = url.value.trim();
  if (!value || props.busy) return;
  emit('submit', value);
}

function dismiss(): void {
  if (props.busy) return;
  emit('close');
}
</script>

<template>
  <div class="backdrop" @click.self="dismiss">
    <div class="dialog" role="dialog" aria-label="App veröffentlichen">
      <header class="head">
        <h2>„{{ props.appName }}“ veröffentlichen</h2>
        <button type="button" class="close" title="Schließen" @click="dismiss">✕</button>
      </header>

      <div class="body">
        <p class="hint">
          Diese App liegt bisher nur hier. Lege bei deinem Anbieter (GitHub, GitLab, …) ein
          <strong>leeres</strong> Repository an — ohne Readme und ohne Lizenz — und gib seine Adresse
          hier ein. Morphos trägt sie als <code>origin</code> ein und schiebt die ganze Historie
          hinüber; danach geht es mit Push und Pull weiter.
        </p>
        <form class="row" @submit.prevent="submit">
          <input
            v-model="url"
            type="text"
            class="url-input"
            placeholder="https://github.com/jemand/meine-app.git"
            aria-label="Adresse des leeren Repositories"
            autofocus
            :disabled="props.busy"
          />
          <button type="submit" class="btn primary go" :disabled="!url.trim() || props.busy">
            Veröffentlichen
          </button>
        </form>
        <p class="hint small">
          Das Repository selbst legt Morphos nicht an. Zugangsdaten kommen aus deiner
          Git-Einrichtung — für GitHub genügt „gh auth login“ im Terminal.
        </p>

        <p v-if="props.busy" class="busy">Die App wird veröffentlicht …</p>
        <p v-if="props.error" class="error">{{ props.error }}</p>
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
  width: min(520px, 100%);
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
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.head h2 {
  margin: 0;
  font-size: 15px;
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
  gap: 14px;
}
.hint {
  color: var(--muted);
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.hint.small {
  font-size: 11px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.url-input {
  flex: 1;
  min-width: 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
.url-input:disabled {
  opacity: 0.6;
}
code {
  background: var(--panel-2);
  border-radius: 5px;
  padding: 1px 5px;
  font-size: 11px;
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
.btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.busy {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.error {
  margin: 0;
  background: rgba(255, 108, 108, 0.12);
  border: 1px solid var(--danger);
  color: #ffb3b3;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 12px;
  white-space: pre-wrap;
}
</style>
