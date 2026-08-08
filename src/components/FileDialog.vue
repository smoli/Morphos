<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getHost } from '@/services/host';
import {
  applyDefaultExtension,
  breadcrumbs,
  joinRelPath,
  parentDir,
  sanitizeFileName,
  visibleEntries,
} from '@/core/dialog';
import type { DialogKind, DialogRequest, FsEntry } from '@/types';

/**
 * Der Dateiauswahl-Dialog der Shell. Er wird im vertrauenswürdigen Renderer
 * gezeichnet (die App im iframe kann ihn weder nachbauen noch umgestalten) und
 * zeigt ausschließlich den Datenordner und dessen Unterordner — über die Wurzel
 * hinaus führt kein Weg. Zurück kommt ein relativer Pfad oder null (Abbruch).
 *
 * Das Blättern nutzt den Host direkt, NICHT die Berechtigungsprüfung der App:
 * Der Anwender sieht ja gerade selbst, was er auswählt. Erst das anschließende
 * readFile/writeFile der App läuft durch das übliche Berechtigungsgatter.
 */
const props = defineProps<{ request: DialogRequest; root: string }>();
const emit = defineEmits<{ (e: 'pick', path: string | null): void }>();

const TITLES: Record<DialogKind, string> = {
  open: 'Datei öffnen',
  save: 'Datei speichern',
  directory: 'Ordner wählen',
};
const CONFIRM_LABELS: Record<DialogKind, string> = {
  open: 'Öffnen',
  save: 'Speichern',
  directory: 'Diesen Ordner wählen',
};

const kind = props.request.kind;
const exts = props.request.extensions;

const dir = ref(props.request.startDir);
const entries = ref<FsEntry[]>([]);
const loading = ref(false);
const error = ref('');
/** Im aktuellen Ordner gewählte Datei (kind=open). */
const selected = ref('');
/** Eingetippter Zielname (kind=save). */
const name = ref(props.request.suggestedName ?? '');
/** Name, dessen Überschreiben der Anwender noch bestätigen muss. */
const overwrite = ref('');
/** Eingabe für „Neuer Ordner“ (null = geschlossen). */
const newFolder = ref<string | null>(null);

const title = computed(() => props.request.title || TITLES[kind]);
const items = computed(() => visibleEntries(entries.value, kind, exts));
const crumbs = computed(() => breadcrumbs(dir.value));
const canCreateFolder = kind !== 'open';
const canConfirm = computed(() => {
  if (kind === 'open') return !!selected.value;
  if (kind === 'save') return !!sanitizeFileName(name.value);
  return true; // Ordnerauswahl: der gerade offene Ordner ist immer wählbar
});

/** Liest einen Ordner ein und macht ihn zum aktuellen. */
async function load(next: string): Promise<void> {
  loading.value = true;
  error.value = '';
  selected.value = '';
  overwrite.value = '';
  newFolder.value = null;
  try {
    const res = await getHost().fs(props.root, { op: 'list', path: next });
    entries.value = res.ok ? ((res.result as FsEntry[]) ?? []) : [];
    if (!res.ok) error.value = res.error;
  } catch (err) {
    entries.value = [];
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    dir.value = next;
    loading.value = false;
  }
}

function onEntry(entry: FsEntry): void {
  if (entry.isDir) {
    void load(entry.path);
    return;
  }
  selected.value = entry.name;
  if (kind === 'save') name.value = entry.name;
}

function onEntryDouble(entry: FsEntry): void {
  onEntry(entry);
  if (!entry.isDir) confirm();
}

function confirm(): void {
  if (kind === 'directory') {
    emit('pick', dir.value);
    return;
  }
  if (kind === 'open') {
    if (selected.value) emit('pick', joinRelPath(dir.value, selected.value));
    return;
  }
  const target = applyDefaultExtension(sanitizeFileName(name.value), exts);
  if (!target) return;
  // Vor dem Überschreiben genau einmal nachfragen. Geprüft wird gegen ALLE
  // Einträge des Ordners — auch gegen die, die der Endungsfilter ausblendet.
  const taken = entries.value.some((e) => !e.isDir && e.name === target);
  if (taken && overwrite.value !== target) {
    overwrite.value = target;
    return;
  }
  emit('pick', joinRelPath(dir.value, target));
}

function cancel(): void {
  emit('pick', null);
}

/** Legt einen Unterordner an und wechselt gleich hinein. */
async function createFolder(): Promise<void> {
  const folder = sanitizeFileName(newFolder.value);
  if (!folder) return;
  const path = joinRelPath(dir.value, folder);
  try {
    const res = await getHost().fs(props.root, { op: 'mkdir', path });
    if (!res.ok) {
      error.value = res.error;
      return;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    return;
  }
  await load(path);
}

// Ein geänderter Zielname setzt eine offene Überschreib-Rückfrage zurück.
watch(name, () => {
  overwrite.value = '';
});

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  // Escape schließt zuerst die Ordnereingabe, erst dann den Dialog.
  if (newFolder.value !== null) newFolder.value = null;
  else cancel();
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  void load(dir.value);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @mousedown.stop>
    <div class="dialog" role="dialog" aria-modal="true">
      <header class="head">
        <h3>{{ title }}</h3>
        <span v-if="exts.length" class="filter">nur {{ exts.map((e) => '.' + e).join(', ') }}</span>
      </header>

      <nav class="crumbs">
        <button v-if="dir" type="button" class="up" title="Übergeordneter Ordner" @click="load(parentDir(dir))">
          ↑
        </button>
        <button type="button" class="crumb" @click="load('')">Datenordner</button>
        <template v-for="c in crumbs" :key="c.path">
          <span class="sep">/</span>
          <button type="button" class="crumb" @click="load(c.path)">{{ c.name }}</button>
        </template>
      </nav>

      <ul class="list">
        <li v-if="loading" class="empty">Wird gelesen …</li>
        <li v-else-if="!items.length" class="empty">Dieser Ordner ist leer.</li>
        <li
          v-for="entry in items"
          :key="entry.path"
          class="entry"
          :class="{ dir: entry.isDir, active: !entry.isDir && entry.name === selected }"
          @click="onEntry(entry)"
          @dblclick="onEntryDouble(entry)"
        >
          <span class="entry-icon">{{ entry.isDir ? '📁' : '📄' }}</span>
          <span class="entry-name">{{ entry.name }}</span>
        </li>
      </ul>

      <div v-if="kind === 'save'" class="name-row">
        <label for="morphos-file-name">Dateiname</label>
        <input
          id="morphos-file-name"
          v-model="name"
          class="name"
          type="text"
          autocomplete="off"
          @keyup.enter="confirm"
        />
      </div>

      <div v-if="newFolder !== null" class="folder-row">
        <input
          v-model="newFolder"
          class="folder-name"
          type="text"
          placeholder="Name des Ordners"
          autocomplete="off"
          @keyup.enter="createFolder"
        />
        <button type="button" class="create-folder" @click="createFolder">Anlegen</button>
        <button type="button" class="ghost" @click="newFolder = null">Abbrechen</button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <p v-if="overwrite" class="overwrite-hint">
        „{{ overwrite }}“ gibt es bereits. Überschreiben?
      </p>

      <footer class="actions">
        <button
          v-if="canCreateFolder && newFolder === null"
          type="button"
          class="ghost new-folder"
          @click="newFolder = ''"
        >
          Neuer Ordner
        </button>
        <span class="spacer"></span>
        <button type="button" class="ghost cancel" @click="cancel">Abbrechen</button>
        <button v-if="overwrite" type="button" class="primary overwrite" @click="confirm">Überschreiben</button>
        <button v-else type="button" class="primary confirm" :disabled="!canConfirm" @click="confirm">
          {{ CONFIRM_LABELS[kind] }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(9, 10, 13, 0.6);
  backdrop-filter: blur(2px);
}
.dialog {
  display: flex;
  flex-direction: column;
  width: min(460px, 94%);
  max-height: 90%;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  gap: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
h3 {
  margin: 0;
  font-size: 15px;
}
.filter {
  font-size: 11px;
  color: var(--muted);
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  font-size: 12px;
}
.crumbs button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 7px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
}
.crumbs button:hover {
  border-color: var(--border);
  color: var(--text);
}
.sep {
  color: var(--muted);
  opacity: 0.6;
}
.list {
  flex: 1;
  min-height: 140px;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.entry:hover {
  background: rgba(255, 255, 255, 0.06);
}
.entry.active {
  background: var(--accent);
  color: #fff;
}
.entry-icon {
  flex-shrink: 0;
  font-size: 12px;
}
.entry-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  padding: 8px;
  color: var(--muted);
  font-size: 12px;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}
.folder-row {
  display: flex;
  gap: 8px;
}
input {
  flex: 1;
  min-width: 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 13px;
}
input:focus {
  outline: none;
  border-color: var(--accent);
}
.error {
  margin: 0;
  color: #ffb3b3;
  font-size: 12px;
}
.overwrite-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text);
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spacer {
  flex: 1;
}
button {
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
  background: var(--panel-2);
}
.primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
}
.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
.ghost {
  background: transparent;
  color: var(--muted);
}
.ghost:hover {
  color: var(--text);
  border-color: var(--accent);
}
</style>
