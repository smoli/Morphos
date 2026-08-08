<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from './AppIcon.vue';
import {
  fitIconSize,
  ICON_FILE_TYPES,
  isIconFileType,
  MAX_ICON_PX,
  normalizeEmojiIcon,
  validateIconImage,
} from '@/core/icon';

/**
 * Kleiner Dialog, mit dem der Anwender das Icon EINER App festlegt: ein Emoji
 * eintippen/einfügen oder ein Bild wählen. Das Bild wird hier gerastert und
 * verkleinert — abgelegt wird nur ein kleines PNG als data:-URI.
 */
const props = defineProps<{ name: string; icon: string; custom?: boolean }>();
const emit = defineEmits<{ close: []; apply: [icon: string | null] }>();

const emoji = ref('');
const preview = ref<string | null>(null);
const error = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

/** Immer kleiner werden, bis das PNG unter den Deckel passt (Fotos sind dicht). */
const STEPS = [MAX_ICON_PX, 96, 64];

function useEmoji(): void {
  const value = normalizeEmojiIcon(emoji.value);
  if (!value) {
    error.value = 'Bitte gib ein Zeichen (Emoji) ein.';
    return;
  }
  emit('apply', value);
}

function pickImage(): void {
  fileInput.value?.click();
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // dieselbe Datei soll erneut wählbar bleiben
  if (!file) return;
  error.value = null;
  if (!isIconFileType(file.type)) {
    error.value = 'Dieser Dateityp wird nicht unterstützt (PNG, JPEG, GIF, WebP, SVG).';
    return;
  }
  try {
    const dataUri = await rasterize(file);
    preview.value = dataUri;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function useImage(): void {
  if (preview.value) emit('apply', preview.value);
}

function reset(): void {
  emit('apply', null);
}

/**
 * Wandelt die gewählte Datei in ein kleines PNG. Das Rastern erledigt zugleich
 * die Sicherheitsfrage bei SVG: Abgelegt wird nur ein Bild aus Bildpunkten,
 * kein Dokument, das etwas ausführen könnte.
 */
async function rasterize(file: File): Promise<string> {
  const image = await loadImage(file);
  for (const max of STEPS) {
    const { width, height } = fitIconSize(image.naturalWidth, image.naturalHeight, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    ctx.drawImage(image, 0, 0, width, height);
    const dataUri = canvas.toDataURL('image/png');
    if (validateIconImage(dataUri).ok) return dataUri;
  }
  throw new Error('Das Bild lässt sich nicht klein genug rechnen. Bitte ein einfacheres Bild wählen.');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden.'));
    };
    image.src = url;
  });
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Icon der App">
      <header class="head">
        <h2>Icon – {{ props.name }}</h2>
        <button type="button" class="close" title="Schließen" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <div class="current">
          <AppIcon class="current-icon" :icon="preview ?? props.icon" :size="64" />
          <p class="hint">
            <template v-if="preview">Vorschau des gewählten Bildes — noch nicht übernommen.</template>
            <template v-else-if="props.custom">Dieses Icon hast du selbst gesetzt.</template>
            <template v-else>Vorgabe aus der App (vom Agenten gewählt).</template>
          </p>
        </div>

        <section class="block">
          <h3>Emoji</h3>
          <form class="row" @submit.prevent="useEmoji">
            <input v-model="emoji" type="text" class="emoji-input" placeholder="🎯" aria-label="Emoji" />
            <button type="submit" class="btn primary" :disabled="!emoji.trim()">Übernehmen</button>
          </form>
        </section>

        <section class="block">
          <h3>Bild</h3>
          <p class="hint">
            PNG, JPEG, GIF, WebP oder SVG. Das Bild wird auf {{ MAX_ICON_PX }} px verkleinert und
            mit der App gespeichert.
          </p>
          <div class="row">
            <button type="button" class="btn" @click="pickImage">Bild wählen …</button>
            <button type="button" class="btn primary" :disabled="!preview" @click="useImage">Übernehmen</button>
          </div>
          <input
            ref="fileInput"
            class="file"
            type="file"
            :accept="ICON_FILE_TYPES.join(',')"
            @change="onFile"
          />
        </section>

        <p v-if="error" class="error">{{ error }}</p>

        <footer class="foot">
          <button type="button" class="btn" :disabled="!props.custom" @click="reset">Auf Vorgabe zurücksetzen</button>
        </footer>
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
  width: min(420px, 100%);
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: 18px;
}
.current {
  display: flex;
  align-items: center;
  gap: 14px;
}
.current-icon {
  flex-shrink: 0;
}
.block h3 {
  margin: 0 0 6px;
  font-size: 13px;
}
.hint {
  color: var(--muted);
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.block .hint {
  margin-bottom: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.emoji-input {
  flex: 1;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 18px;
}
.file {
  display: none;
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
.error {
  margin: 0;
  background: rgba(255, 108, 108, 0.12);
  border: 1px solid var(--danger);
  color: #ffb3b3;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 12px;
}
.foot {
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
</style>
