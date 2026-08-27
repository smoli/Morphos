<script setup lang="ts">
/**
 * Die Beigaben einer App verwalten (e16/c0119): was sie hat, was dazukommt,
 * was sie wieder verliert — und wie das Gewählte aussieht.
 *
 * Der Panel hält keine Bytes vor. Die Liste sind Auskünfte (Name, Typ, Größe);
 * den Inhalt holt er einzeln, wenn der Anwender eine Beigabe anklickt. Dass er
 * das über MITGEGEBENE Funktionen tut (`read`, `add`, `remove`) statt über
 * Ereignisse, hat einen Grund: Ablegen und Entfernen sind je ein Commit auf der
 * Platte, und ob er gelingt, gehört hierher — nur hier lässt es sich dem
 * Anwender an Ort und Stelle hinschreiben. (Dasselbe Muster wie `authorize` in
 * AppCanvas.)
 *
 * Entfernt wird erst nach Rückfrage, und die Rückfrage sagt, wer die Datei noch
 * verwendet (core/assetview). Verhindert wird nichts: Die Referenz im Code
 * bleibt danach stehen und läuft ins Leere — das Bündeln lässt sie unangetastet
 * (c0117), die App läuft weiter, nur das Bild fehlt.
 */
import { computed, ref, watch } from 'vue';
import { formatBytes } from '@/core/bytes';
import {
  assetDataUri,
  assetIcon,
  assetText,
  assetTypeLabel,
  assetUsers,
  assetView,
  base64FromDataUri,
} from '@/core/assetview';
import type { AssetInfo } from '@/core/assets';
import type { AssetContent, AssetResult, SaveResult, SourceFile } from '@/types';

const props = defineProps<{
  /** Die Beigaben der App, in der Reihenfolge, in der sie stehen sollen. */
  assets: AssetInfo[];
  /** Die Quelldateien — nur, um vor dem Entfernen zu warnen (optional). */
  files?: SourceFile[];
  /** Holt die Bytes einer Beigabe (base64) — auf Zuruf, für die Vorschau. */
  read: (path: string) => Promise<AssetContent | null>;
  /** Legt eine Datei ab und meldet, unter welchem Namen — oder woran es scheiterte. */
  add: (name: string, data: string) => Promise<AssetResult>;
  /** Entfernt eine Beigabe. */
  remove: (path: string) => Promise<SaveResult>;
}>();

defineEmits<{ close: [] }>();

const fileInput = ref<HTMLInputElement | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

const selected = ref<string | null>(null);
const content = ref<AssetContent | null>(null);
const loading = ref(false);
/** Zählt die Lesevorgänge: Nur die Antwort auf den JÜNGSTEN wird angezeigt. */
let readSeq = 0;

const confirming = ref<AssetInfo | null>(null);

const current = computed(() => props.assets.find((a) => a.path === selected.value) ?? null);

// Was nicht mehr in der Liste steht, ist auch nicht mehr zu zeigen: Nach dem
// Entfernen (oder einem Revert) stünde sonst die Vorschau einer Datei da, die es
// nicht mehr gibt.
watch(
  () => props.assets,
  (assets) => {
    if (selected.value && !assets.some((a) => a.path === selected.value)) clear();
    if (confirming.value && !assets.some((a) => a.path === confirming.value?.path)) confirming.value = null;
  },
);

function clear(): void {
  selected.value = null;
  content.value = null;
  readSeq += 1; // ein noch laufendes Lesen geht damit ins Leere
}

/** Die gewählte Beigabe holen — die Antwort gilt nur, wenn inzwischen keine andere gewählt wurde. */
async function select(asset: AssetInfo): Promise<void> {
  if (selected.value === asset.path) return;
  selected.value = asset.path;
  content.value = null;
  loading.value = true;
  const mine = (readSeq += 1);
  let read: AssetContent | null = null;
  try {
    read = await props.read(asset.path);
  } catch {
    read = null;
  }
  if (mine !== readSeq) return;
  content.value = read;
  loading.value = false;
}

// ---- Vorschau: die Art entscheidet, was zu sehen ist. Bild, Ton und Video
//      leben von der data:-URI; Datendateien werden gelesen (gekappt); alles
//      Übrige — Schriften, PDFs, Unbekanntes — bleibt bei den Angaben zur Datei.
const view = computed(() => (current.value ? assetView(current.value.mime) : 'file'));
const dataUri = computed(() => (content.value ? assetDataUri(content.value.mime, content.value.data) : ''));
const text = computed(() => (content.value ? assetText(content.value.data) : { text: '', capped: false }));

/**
 * Liest die Bytes einer gewählten Datei so, wie sie über die Brücke gehen:
 * base64. Der FileReader ist der Weg dorthin, den auch Icon und Hintergrundbild
 * gehen — er liefert `data:<typ>;base64,<inhalt>`, und daraus wird der Inhalt
 * geschält.
 */
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(base64FromDataUri(String(reader.result ?? '')));
    reader.onerror = () => reject(reader.error ?? new Error('Die Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Legt die gewählten Dateien ab — NACHEINANDER, denn jede ist ein eigener
 * Commit; nebeneinander liefen sie sich im selben Repository in die Quere.
 * Eine, die scheitert, hält die übrigen nicht auf: Wer fünf Bilder zieht, soll
 * die vier bekommen, die gehen. Hingeschrieben wird der erste Fehlschlag.
 */
async function addFiles(files: File[]): Promise<void> {
  if (!files.length || busy.value) return;
  error.value = null;
  busy.value = true;
  for (const file of files) {
    try {
      const data = await readFile(file);
      const res = data
        ? await props.add(file.name, data)
        : { ok: false, error: 'Die Datei ist leer oder ließ sich nicht lesen.' };
      if (!res.ok && !error.value) error.value = `„${file.name}“: ${res.error ?? 'Ablegen nicht möglich.'}`;
    } catch (err) {
      if (!error.value) error.value = `„${file.name}“: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  busy.value = false;
}

function pickFiles(): void {
  fileInput.value?.click();
}

async function onPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = ''; // dieselbe Datei soll erneut wählbar bleiben
  await addFiles(files);
}

// ---- Fallenlassen: Zähler statt Schalter, weil dragleave auch beim Übertritt
//      auf ein Kindelement feuert — ein bloßer Schalter flackerte dabei.
const dragDepth = ref(0);
const dragging = computed(() => dragDepth.value > 0);

function onDragEnter(): void {
  dragDepth.value += 1;
}

function onDragLeave(): void {
  dragDepth.value = Math.max(0, dragDepth.value - 1);
}

async function onDrop(event: DragEvent): Promise<void> {
  dragDepth.value = 0;
  await addFiles(Array.from(event.dataTransfer?.files ?? []));
}

// ---- Entfernen: erst fragen, dabei sagen, wer sie noch verwendet.
const users = computed(() => (confirming.value ? assetUsers(props.files ?? [], confirming.value.path) : []));

function askRemove(asset: AssetInfo): void {
  error.value = null;
  confirming.value = asset;
}

async function confirmRemove(): Promise<void> {
  const asset = confirming.value;
  confirming.value = null;
  if (!asset || busy.value) return;
  busy.value = true;
  const res = await props.remove(asset.path);
  busy.value = false;
  if (!res.ok) error.value = res.error ?? 'Die Beigabe konnte nicht entfernt werden.';
}
</script>

<template>
  <div
    class="asset-panel"
    :class="{ dragging }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="asset-head">
      <span class="asset-title">Beigaben<span v-if="assets.length" class="asset-count">{{ assets.length }}</span></span>
      <span class="asset-actions">
        <button type="button" class="asset-add" :disabled="busy" @click="pickFiles">Dateien wählen …</button>
        <button type="button" class="asset-close" @click="$emit('close')">Schließen</button>
      </span>
    </div>

    <p class="asset-hint">
      Beigaben liegen unter <code>assets/</code> und bleiben der App erhalten. Dateien lassen sich auch
      hierher ziehen; im Chat hängst du sie an einen Wunsch.
    </p>

    <div class="asset-body">
      <div class="asset-list">
        <p v-if="!assets.length" class="asset-empty">Diese App hat noch keine Beigaben.</p>
        <button
          v-for="asset in assets"
          :key="asset.path"
          type="button"
          class="asset-item"
          :class="{ active: asset.path === selected }"
          @click="select(asset)"
        >
          <span class="asset-icon">{{ assetIcon(asset.mime) }}</span>
          <span class="asset-meta">
            <span class="asset-name">{{ asset.name }}</span>
            <span class="asset-sub">
              <span class="asset-type">{{ assetTypeLabel(asset) }}</span>
              <span class="asset-size">{{ formatBytes(asset.size) }}</span>
            </span>
          </span>
          <span class="asset-remove" role="button" title="Entfernen" @click.stop="askRemove(asset)">✕</span>
        </button>
      </div>

      <div class="asset-preview">
        <p v-if="!current" class="asset-preview-empty">Eine Beigabe wählen, um sie anzusehen.</p>
        <template v-else>
          <div class="pv-head">
            <span class="pv-name">{{ current.name }}</span>
            <span class="pv-sub">{{ assetTypeLabel(current) }} · {{ formatBytes(current.size) }}</span>
            <code class="pv-path">{{ current.path }}</code>
          </div>
          <p v-if="loading" class="pv-loading">Wird gelesen …</p>
          <p v-else-if="!content" class="pv-missing">Diese Datei lässt sich nicht lesen.</p>
          <img v-else-if="view === 'image'" class="pv-image" :src="dataUri" :alt="current.name" />
          <audio v-else-if="view === 'audio'" class="pv-audio" controls :src="dataUri"></audio>
          <video v-else-if="view === 'video'" class="pv-video" controls :src="dataUri"></video>
          <template v-else-if="view === 'text'">
            <pre class="pv-text">{{ text.text }}</pre>
            <p v-if="text.capped" class="pv-capped">Gekürzt — hier steht nur der Anfang der Datei.</p>
          </template>
          <div v-else class="pv-file">
            <span class="pv-file-icon">{{ assetIcon(current.mime) }}</span>
            <span class="pv-file-name">{{ current.name }}</span>
            <span class="pv-file-sub">{{ assetTypeLabel(current) }} · {{ formatBytes(current.size) }}</span>
            <span class="pv-file-note">Von dieser Art gibt es keine Ansicht — die App weiß, was damit zu tun ist.</span>
          </div>
        </template>
      </div>
    </div>

    <div v-if="confirming" class="asset-confirm">
      <span class="asset-confirm-text">„{{ confirming.name }}“ entfernen?</span>
      <span v-if="users.length" class="asset-used">
        Wird noch verwendet in {{ users.join(', ') }} — die Stelle im Code bleibt dann leer.
      </span>
      <span class="asset-confirm-buttons">
        <button type="button" class="asset-confirm-ok" @click="confirmRemove">Entfernen</button>
        <button type="button" class="asset-confirm-cancel" @click="confirming = null">Abbrechen</button>
      </span>
    </div>

    <p v-if="error" class="asset-error">{{ error }}</p>

    <div v-if="dragging" class="asset-drop">Dateien hier ablegen</div>

    <input ref="fileInput" class="asset-file" type="file" multiple @change="onPicked" />
  </div>
</template>

<style scoped>
.asset-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
}
.asset-panel.dragging {
  outline: 2px dashed var(--accent, #6ea8fe);
  outline-offset: -6px;
}
.asset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.asset-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.asset-count {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 7px;
  font-size: 11px;
  color: var(--muted);
}
.asset-actions {
  display: flex;
  gap: 6px;
}
.asset-add,
.asset-close {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.asset-add:disabled {
  opacity: 0.5;
  cursor: default;
}
.asset-hint {
  margin: 0;
  padding: 8px 14px;
  color: var(--muted);
  font-size: 12px;
  border-bottom: 1px solid var(--border);
}
.asset-hint code {
  background: var(--panel-2);
  border-radius: 4px;
  padding: 1px 4px;
}
.asset-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.asset-list {
  width: 44%;
  min-width: 200px;
  overflow: auto;
  border-right: 1px solid var(--border);
  padding: 8px;
}
.asset-empty {
  margin: 8px 6px;
  color: var(--muted);
  font-size: 12px;
}
.asset-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px 8px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.asset-item:hover {
  border-color: var(--border);
}
.asset-item.active {
  background: var(--panel-2);
  border-color: var(--border);
}
.asset-icon {
  font-size: 16px;
}
.asset-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.asset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-sub {
  display: flex;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}
.asset-remove {
  color: var(--muted);
  padding: 0 4px;
  border-radius: 6px;
  cursor: pointer;
}
.asset-remove:hover {
  color: var(--text);
  background: var(--panel);
}
.asset-preview {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 12px 14px;
  font-size: 12px;
}
.asset-preview-empty,
.pv-loading,
.pv-missing,
.pv-capped {
  color: var(--muted);
}
.pv-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}
.pv-name {
  font-size: 13px;
}
.pv-sub,
.pv-path {
  color: var(--muted);
  font-size: 11px;
}
.pv-image {
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
  background: repeating-conic-gradient(rgba(255, 255, 255, 0.06) 0% 25%, transparent 0% 50%) 50% / 16px 16px;
}
.pv-audio,
.pv-video {
  width: 100%;
  max-height: 60vh;
}
.pv-text {
  margin: 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  max-height: 60vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.pv-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 24px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--muted);
  text-align: center;
}
.pv-file-icon {
  font-size: 34px;
}
.pv-file-name {
  color: var(--text);
  font-size: 13px;
}
.asset-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--panel-2);
  font-size: 12px;
}
.asset-used {
  color: var(--muted);
  flex: 1;
}
.asset-confirm-buttons {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.asset-confirm-ok,
.asset-confirm-cancel {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.asset-confirm-ok {
  border-color: #b4443a;
  color: #ff9a90;
}
.asset-error {
  margin: 0;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  color: #ff9a90;
  font-size: 12px;
}
.asset-drop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 7, 10, 0.55);
  color: var(--text);
  font-size: 14px;
  pointer-events: none;
}
.asset-file {
  display: none;
}
</style>
