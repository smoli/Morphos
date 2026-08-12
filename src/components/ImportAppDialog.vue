<script setup lang="ts">
import { ref } from 'vue';
import type { ImportChoice, ImportCollision } from '@/types';

/**
 * „App aus Git laden…“ (c0074): Der Anwender gibt die Adresse eines
 * Repositories ein, Morphos klont es und ordnet die App ein.
 *
 * Der Dialog fragt nur und zeigt an — geholt wird im Hauptprozess
 * (core/appimport). Beansprucht die geholte App eine Id, die hier schon vergeben
 * ist, kommt statt der App eine Rückfrage zurück: Dann tritt das Adressfeld ab
 * und es stehen die drei Wege da — Kopie, Ersetzen, Abbrechen.
 */
const props = defineProps<{
  /** Läuft gerade ein Klon? Dann ist der Dialog nur noch zum Zusehen da. */
  busy: boolean;
  error: string | null;
  /** Belegte Id — die Rückfrage an den Anwender (sonst null). */
  collision: ImportCollision | null;
}>();

const emit = defineEmits<{ close: []; submit: [url: string]; choose: [choice: ImportChoice] }>();

const url = ref('');

function submit(): void {
  const value = url.value.trim();
  if (!value || props.busy) return;
  emit('submit', value);
}

/** Zumachen heißt bei offener Rückfrage: abbrechen — der wartende Klon muss weg. */
function dismiss(): void {
  if (props.busy) return;
  if (props.collision) emit('choose', 'cancel');
  else emit('close');
}
</script>

<template>
  <div class="backdrop" @click.self="dismiss">
    <div class="dialog" role="dialog" aria-label="App aus Git laden">
      <header class="head">
        <h2>App aus Git laden</h2>
        <button type="button" class="close" title="Schließen" @click="dismiss">✕</button>
      </header>

      <div class="body">
        <template v-if="props.collision">
          <section class="collision">
            <p>
              Es gibt hier schon eine App mit der Id
              <code>{{ props.collision.id }}</code> — „{{ props.collision.existingName }}“.
            </p>
            <p class="hint">
              „{{ props.collision.name }}“ kann als Kopie unter der Id
              <code>{{ props.collision.copyId }}</code> daneben liegen (Name bleibt), oder die
              vorhandene App ersetzen — dann sind deren Stand und Historie weg.
            </p>
            <div class="choices">
              <button type="button" class="btn primary choice-copy" @click="emit('choose', 'copy')">
                Als Kopie laden
              </button>
              <button type="button" class="btn danger choice-replace" @click="emit('choose', 'replace')">
                Vorhandene ersetzen
              </button>
              <button type="button" class="btn choice-cancel" @click="emit('choose', 'cancel')">
                Abbrechen
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <p class="hint">
            Jede Morphos-App ist ein Git-Repository. Gib die Adresse an, unter der eine App liegt —
            sie wird mit ihrer ganzen Historie geholt und als <code>origin</code> gemerkt.
          </p>
          <form class="row" @submit.prevent="submit">
            <input
              v-model="url"
              type="text"
              class="url-input"
              placeholder="https://github.com/jemand/meine-app.git"
              aria-label="Adresse des Repositories"
              autofocus
              :disabled="props.busy"
            />
            <button type="submit" class="btn primary go" :disabled="!url.trim() || props.busy">Laden</button>
          </form>
          <p class="hint small">
            Zugangsdaten kommen aus deiner Git-Einrichtung — öffentliche Repositories gehen ohne,
            private nur, wenn dein Git sie kennt.
          </p>
        </template>

        <p v-if="props.busy" class="busy">Das Repository wird geholt …</p>
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
.collision p {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.5;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
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
.btn.danger {
  border-color: var(--danger);
  color: #ffb3b3;
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
