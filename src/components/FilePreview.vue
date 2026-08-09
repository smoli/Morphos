<script setup lang="ts">
/**
 * Die Vorschau der im Explorer ausgewählten Datei.
 *
 * Zwei Wege, streng getrennt (die Regeln dazu stehen rein in core/preview):
 * Passives — Bild, Video, Ton, Markdown, JSON, Text — zeigt die Schale selbst,
 * wobei alles, was zu HTML wird, zuerst escapt wird. Aktives — HTML und SVG —
 * kommt in dieselbe Sandbox wie eine erzeugte App: eigener iframe ohne
 * allow-same-origin, dazu die CSP; eine fremde Datei führt so nie Code im
 * Renderer der Schale aus.
 *
 * Groß darf alles sein: Medien laufen über den eingegrenzten Strom
 * (core/filelink, `morphos-file://`) und werden nie durch den IPC-Kanal
 * gereicht; Text oberhalb von TEXT_LIMIT wird gar nicht erst gelesen.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { getHost } from '@/services/host';
import { formatBytes } from '@/core/bytes';
import { fileUrl } from '@/core/filelink';
import { renderMarkdown } from '@/core/markdown';
import {
  capText,
  highlightJson,
  isStreamed,
  kindLabel,
  previewDocument,
  previewKind,
  prettyJson,
  TEXT_LIMIT,
} from '@/core/preview';
import type { FsEntry, FsStatInfo } from '@/types';

const props = defineProps<{ root: string; entry: FsEntry }>();

// Dieselbe Sandbox wie AppCanvas: Skripte dürfen laufen, aber ohne Zugang zur
// Schale (kein allow-same-origin) und ohne Weg nach außen (kein allow-popups).
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-pointer-lock';

const kind = computed(() => previewKind(props.entry.name));
const info = ref<FsStatInfo | null>(null);
const text = ref('');
const loading = ref(false);
const error = ref('');
const notice = ref('');
const mediaFailed = ref(false);
/** Das Dokument für den Sandbox-iframe (blob:, wie bei den erzeugten Apps). */
const docUrl = ref('');

/** Zählt die Aufträge, damit eine späte Antwort keine neuere überschreibt. */
let token = 0;

const streamUrl = computed(() => fileUrl(props.root, props.entry.path));
const sizeLabel = computed(() => (info.value ? formatBytes(info.value.size) : ''));
const typeLabel = computed(() => kindLabel(kind.value));

/** Eingerücktes, gefärbtes JSON — null, wenn der Inhalt keines ist. */
const json = computed(() => {
  if (kind.value !== 'json' || !text.value) return null;
  const pretty = prettyJson(text.value);
  return pretty === null ? null : highlightJson(pretty);
});

const markdown = computed(() => (kind.value === 'markdown' ? renderMarkdown(text.value) : ''));

/** Was gerade zu sehen ist — die eine Entscheidung, statt einer v-else-Kette. */
const view = computed<'media' | 'frame' | 'markdown' | 'json' | 'text' | 'info'>(() => {
  if (error.value || loading.value) return 'info';
  if (isStreamed(kind.value)) return mediaFailed.value ? 'info' : 'media';
  if (kind.value === 'html' || kind.value === 'svg') return docUrl.value ? 'frame' : 'info';
  if (!text.value) return 'info';
  if (kind.value === 'markdown') return 'markdown';
  if (kind.value === 'json') return json.value ? 'json' : 'text';
  return 'text';
});

/** Der Satz, der im Info-Zustand die Datei erklärt. */
const infoText = computed(() => {
  if (loading.value) return 'Wird gelesen …';
  if (error.value) return error.value;
  if (mediaFailed.value) return `Dieses Format lässt sich hier nicht darstellen (${typeLabel.value}).`;
  if (notice.value) return notice.value;
  if (kind.value === 'unknown') return 'Für diese Art gibt es keine Vorschau.';
  return 'Diese Datei ist leer.';
});

function releaseDoc(): void {
  if (docUrl.value) URL.revokeObjectURL(docUrl.value);
  docUrl.value = '';
}

/** Liest die ausgewählte Datei — so viel, wie eine Vorschau braucht, und nicht mehr. */
async function load(): Promise<void> {
  const mine = ++token;
  releaseDoc();
  text.value = '';
  error.value = '';
  notice.value = '';
  mediaFailed.value = false;
  info.value = null;
  loading.value = true;

  try {
    const stat = await getHost().fs(props.root, { op: 'stat', path: props.entry.path });
    if (mine !== token) return;
    if (!stat.ok) {
      error.value = stat.error;
      return;
    }
    info.value = stat.result as FsStatInfo;

    // Medien und Unbekanntes werden nicht gelesen: das eine läuft über den
    // Strom, das andere zeigt nur seine Angaben.
    if (isStreamed(kind.value) || kind.value === 'unknown') return;

    if (info.value.size > TEXT_LIMIT) {
      notice.value = `Die Datei ist mit ${formatBytes(info.value.size)} zu groß für eine Vorschau.`;
      return;
    }

    const res = await getHost().fs(props.root, { op: 'read', path: props.entry.path });
    if (mine !== token) return;
    if (!res.ok) {
      error.value = res.error;
      return;
    }

    const capped = capText(String(res.result ?? ''));
    if (capped.capped) notice.value = `Die Vorschau ist auf ${formatBytes(TEXT_LIMIT)} gekürzt.`;
    text.value = capped.text;

    if (kind.value === 'html' || kind.value === 'svg') {
      docUrl.value = URL.createObjectURL(
        new Blob([previewDocument(text.value, kind.value)], { type: 'text/html' }),
      );
    }
  } catch (err) {
    if (mine !== token) return;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (mine === token) loading.value = false;
  }
}

watch(() => [props.root, props.entry.path], () => void load(), { immediate: true });

onBeforeUnmount(() => {
  token += 1;
  releaseDoc();
});
</script>

<template>
  <section class="preview">
    <header class="pv-head">
      <span class="pv-name" :title="entry.name">{{ entry.name }}</span>
      <span class="pv-meta">{{ typeLabel }}<template v-if="sizeLabel"> · {{ sizeLabel }}</template></span>
    </header>

    <!-- Mittig steht, was als Ganzes gesehen wird; Gelesenes beginnt oben. -->
    <div class="pv-body" :class="{ 'pv-mitte': view === 'media' || view === 'info' }">
      <template v-if="view === 'media'">
        <img
          v-if="kind === 'image'"
          class="pv-image"
          :src="streamUrl"
          :alt="entry.name"
          @error="mediaFailed = true"
        />
        <video
          v-else-if="kind === 'video'"
          class="pv-video"
          :src="streamUrl"
          controls
          @error="mediaFailed = true"
        ></video>
        <audio v-else class="pv-audio" :src="streamUrl" controls @error="mediaFailed = true"></audio>
      </template>

      <iframe
        v-else-if="view === 'frame'"
        class="pv-frame"
        :src="docUrl"
        :sandbox="SANDBOX"
        referrerpolicy="no-referrer"
      ></iframe>

      <!-- eslint-disable-next-line vue/no-v-html — renderMarkdown escapt sämtliches HTML zuerst -->
      <div v-else-if="view === 'markdown'" class="md pv-md" v-html="markdown"></div>

      <!-- eslint-disable-next-line vue/no-v-html — highlightJson escapt jedes Stück vor dem Färben -->
      <pre v-else-if="view === 'json'" class="pv-json" v-html="json"></pre>

      <pre v-else-if="view === 'text'" class="pv-text">{{ text }}</pre>

      <p v-else class="pv-none">{{ infoText }}</p>
    </div>

    <footer v-if="notice && view !== 'info'" class="pv-notice">{{ notice }}</footer>
  </section>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 6px;
}
.pv-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.pv-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-meta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
}
.pv-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pv-body.pv-mitte {
  display: flex;
  align-items: center;
  justify-content: center;
}
.pv-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.pv-video {
  max-width: 100%;
  max-height: 100%;
}
.pv-audio {
  width: 100%;
}
.pv-frame {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 6px;
  background: #fff;
}
.pv-md,
.pv-json,
.pv-text {
  margin: 0;
  font-size: 12px;
}
.pv-json,
.pv-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pv-json :deep(.jv-key) {
  color: var(--accent-2);
}
.pv-json :deep(.jv-str) {
  color: #9ae6b4;
}
.pv-json :deep(.jv-num) {
  color: #f6ad55;
}
.pv-json :deep(.jv-bool),
.pv-json :deep(.jv-null) {
  color: #90cdf4;
}
.pv-none {
  margin: 0;
  padding: 12px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.pv-notice {
  font-size: 11px;
  color: var(--muted);
}
</style>
