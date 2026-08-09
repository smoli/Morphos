<script setup lang="ts">
/**
 * Der Datei-Explorer der Schale — die Ansicht im System-Fenster „Dateien“.
 *
 * Er zeigt den Datenordner dieses Arbeitsverzeichnisses und dessen Unterordner,
 * und nur die: Gelesen wird über `getHost().fs`, das im Hauptprozess strikt auf
 * den Datenordner eingegrenzt wird (core/fsaccess) — über die Wurzel hinaus
 * führt kein Weg, auch nicht über die Wegmarken. Verborgenes (alles mit
 * führendem Punkt, auch der Papierkorb) bleibt draußen; siehe core/explorer.
 *
 * Die Liste läuft mit: Der Hauptprozess beobachtet den offenen Ordner
 * (core/watch) und meldet gebündelt, wenn sich dort etwas getan hat — dann wird
 * neu gelesen. Mit dem Ordnerwechsel wandert der Beobachter mit, mit dem
 * Fenster endet er.
 *
 * Die ausgewählte Datei zeigt daneben ihre Vorschau (FilePreview) — passives
 * escape-first in der Schale, aktives HTML/SVG in einer Sandbox.
 *
 * Verwaltet wird über `getHost().shellFs` (c0050): anlegen, umbenennen,
 * verschieben, kopieren und löschen. Löschen heißt hier: in den Papierkorb —
 * `.trash` im Datenordner, verborgen vor der Liste und vor den Apps; von dort
 * kommt alles zurück, bis der Anwender den Korb ausdrücklich leert. Jedes
 * Überschreiben und jedes endgültige Löschen fragt vorher nach.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getHost } from '@/services/host';
import { breadcrumbs, parentDir } from '@/core/dialog';
import { explorerEntries, type SortOrder } from '@/core/explorer';
import { useShellStore } from '@/stores/shell';
import { useWorkspaceStore } from '@/stores/workspace';
import FilePreview from './FilePreview.vue';
import type { FsEntry, ShellFsRequest, ShellFsResponse, TrashEntry } from '@/types';

const workspace = useWorkspaceStore();
const shell = useShellStore();

/** Der Datenordner des Arbeitsverzeichnisses — ohne ihn gibt es nichts zu zeigen. */
const root = computed(() => workspace.accessRoot);

/** Der offene Ordner, relativ zum Datenordner ("" = der Datenordner selbst). */
const dir = ref('');
const entries = ref<FsEntry[]>([]);
const loading = ref(false);
const error = ref('');
const selected = ref('');
const order = ref<SortOrder>('asc');

const items = computed(() => explorerEntries(entries.value, order.value));
const crumbs = computed(() => breadcrumbs(dir.value));

/** Der ausgewählte Eintrag — Grundlage jeder Verwaltungs-Aktion. */
const current = computed(() => items.value.find((e) => e.name === selected.value) ?? null);

/** Die ausgewählte Datei — Ordner bekommen keine Vorschau, sie werden geöffnet. */
const preview = computed(() => (current.value && !current.value.isDir ? current.value : null));

/** Was in den Papierkorb gewandert ist (nur in der Papierkorb-Ansicht geladen). */
const trash = ref<TrashEntry[]>([]);
const showTrash = ref(false);

/** Der gemerkte Eintrag fürs Einfügen — `cut` heißt: verschieben statt kopieren. */
const clip = ref<{ path: string; name: string; cut: boolean } | null>(null);

/** Ohne Anbindung (Renderer-Test) zeigt der Explorer nur an, statt zu verwalten. */
const canManage = ref(false);

/** Der laufende Beobachter des offenen Ordners (null = keiner). */
let stopWatch: (() => void) | null = null;
/** Nach dem Abbau darf nichts mehr nachlaufen. */
let alive = true;
/** Zählt die Leseaufträge, damit eine späte Antwort keine neuere überschreibt. */
let token = 0;

/** Liest den offenen Ordner (neu) ein. */
async function list(): Promise<void> {
  const base = root.value;
  if (!base) {
    entries.value = [];
    return;
  }
  const mine = ++token;
  const target = dir.value;
  loading.value = true;
  try {
    const res = await getHost().fs(base, { op: 'list', path: target });
    if (mine !== token) return;
    entries.value = res.ok ? ((res.result as FsEntry[]) ?? []) : [];
    error.value = res.ok ? '' : res.error;
  } catch (err) {
    if (mine !== token) return;
    entries.value = [];
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (mine === token) loading.value = false;
  }
  // Was verschwunden ist, kann nicht ausgewählt bleiben.
  if (selected.value && !entries.value.some((e) => e.name === selected.value)) selected.value = '';
}

/**
 * Meldet den offenen Ordner zur Beobachtung an — und den vorigen ab. Ohne
 * Beobachtung (etwa im Test ohne Anbindung) bleibt die Liste einfach stehen;
 * „Aktualisieren“ hilft dann weiter.
 */
async function rewatch(): Promise<void> {
  stopWatch?.();
  stopWatch = null;
  const base = root.value;
  if (!base) return;
  const start = getHost().watchFolder;
  if (!start) return;

  const target = dir.value;
  try {
    const off = await start(base, target, () => {
      if (alive && dir.value === target) void list();
    });
    // Inzwischen weitergeblättert oder zu? Dann diesen Beobachter gleich wieder ab.
    if (!alive || dir.value !== target) off();
    else stopWatch = off;
  } catch {
    /* Ohne Beobachter ist die Ansicht nur nicht mehr live — kein Fehler für den Anwender. */
  }
}

/** Wechselt in einen Ordner: neu lesen und dort weiter beobachten. */
async function go(next: string): Promise<void> {
  dir.value = next;
  selected.value = '';
  error.value = '';
  showTrash.value = false;
  await Promise.all([list(), rewatch()]);
}

/**
 * Ein Verwaltungsauftrag an die Schale. Liegt am Ziel schon etwas, entscheidet
 * der Anwender — erst danach wird überschrieben. Ein Fehler landet in der
 * Fußzeile, wo auch die Lesefehler stehen.
 */
async function manage(req: ShellFsRequest): Promise<ShellFsResponse | null> {
  const base = root.value;
  const run = getHost().shellFs;
  if (!base || !run) return null;
  error.value = '';

  let res: ShellFsResponse;
  try {
    res = await run(base, req);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    return null;
  }
  if (!res.ok && res.code === 'exists' && !req.overwrite) {
    if (!window.confirm(`${res.error} Soll es überschrieben werden?`)) return null;
    return manage({ ...req, overwrite: true });
  }
  if (!res.ok) error.value = res.error;
  return res;
}

/** Der Name, den eine geglückte Operation hinterlassen hat (für die Auswahl). */
function tail(res: ShellFsResponse | null): string {
  const rel = res?.ok ? String(res.result ?? '') : '';
  return rel.slice(rel.lastIndexOf('/') + 1);
}

/** Nach jeder Änderung: neu lesen — und den Papierkorb mit, wenn er offen ist. */
async function after(res: ShellFsResponse | null): Promise<void> {
  if (!res?.ok) return;
  await list();
  if (showTrash.value) await loadTrash();
}

async function loadTrash(): Promise<void> {
  const res = await manage({ op: 'trashList', path: '' });
  trash.value = res?.ok ? ((res.result as TrashEntry[]) ?? []) : [];
}

async function newFolder(): Promise<void> {
  const name = window.prompt('Name des neuen Ordners', 'Neuer Ordner');
  if (name === null) return;
  const res = await manage({ op: 'newFolder', path: dir.value, to: name });
  if (res?.ok) selected.value = tail(res);
  await after(res);
}

async function renameSelected(): Promise<void> {
  const entry = current.value;
  if (!entry) return;
  const name = window.prompt(`„${entry.name}“ umbenennen in`, entry.name);
  if (name === null || name === entry.name) return;
  const res = await manage({ op: 'rename', path: entry.path, to: name });
  if (res?.ok) selected.value = tail(res);
  await after(res);
}

/** Merkt den ausgewählten Eintrag fürs Einfügen — kopieren oder verschieben. */
function remember(cut: boolean): void {
  const entry = current.value;
  if (entry) clip.value = { path: entry.path, name: entry.name, cut };
}

async function paste(): Promise<void> {
  const source = clip.value;
  if (!source) return;
  const res = await manage({ op: source.cut ? 'move' : 'copy', path: source.path, to: dir.value });
  if (res?.ok) {
    selected.value = tail(res);
    // Ausgeschnittenes gibt es nur einmal — danach ist die Merkstelle leer.
    if (source.cut) clip.value = null;
  }
  await after(res);
}

async function trashSelected(): Promise<void> {
  const entry = current.value;
  if (!entry) return;
  if (!window.confirm(`„${entry.name}“ in den Papierkorb legen?`)) return;
  const res = await manage({ op: 'trash', path: entry.path });
  if (res?.ok) selected.value = '';
  await after(res);
}

async function toggleTrash(): Promise<void> {
  showTrash.value = !showTrash.value;
  if (showTrash.value) await loadTrash();
}

async function restore(item: TrashEntry): Promise<void> {
  await after(await manage({ op: 'restore', path: item.id }));
}

/** Der einzige Weg, an dem nichts zurückkommt — also mit Rückfrage. */
async function emptyTrash(): Promise<void> {
  const count = trash.value.length;
  if (!count) return;
  const what = count === 1 ? 'Ein Eintrag wird' : `${count} Einträge werden`;
  if (!window.confirm(`${what} endgültig gelöscht. Das lässt sich nicht rückgängig machen.`)) return;
  await after(await manage({ op: 'emptyTrash', path: '' }));
}

/** Wann etwas gelöscht wurde — kurz und lesbar. */
function when(ms: number): string {
  return ms ? new Date(ms).toLocaleString('de-DE') : '';
}

function onEntry(entry: FsEntry): void {
  selected.value = entry.name;
}

function onEntryOpen(entry: FsEntry): void {
  if (entry.isDir) void go(entry.path);
  else selected.value = entry.name;
}

function toggleOrder(): void {
  order.value = order.value === 'asc' ? 'desc' : 'asc';
}

// Ein neu festgelegter (oder gewechselter) Datenordner fängt oben wieder an —
// und was aus dem alten gemerkt war, gilt dort nicht mehr.
watch(root, () => {
  clip.value = null;
  trash.value = [];
  void go('');
});

onMounted(() => {
  try {
    canManage.value = typeof getHost().shellFs === 'function';
  } catch {
    canManage.value = false;
  }
  void go('');
});
onBeforeUnmount(() => {
  alive = false;
  stopWatch?.();
  stopWatch = null;
});
</script>

<template>
  <div class="explorer">
    <template v-if="root">
      <div class="ex-bar">
        <nav class="ex-crumbs">
          <button v-if="dir" type="button" class="ex-up" title="Übergeordneter Ordner" @click="go(parentDir(dir))">
            ↑
          </button>
          <button type="button" class="ex-crumb" @click="go('')">Datenordner</button>
          <template v-for="c in crumbs" :key="c.path">
            <span class="ex-sep">/</span>
            <button type="button" class="ex-crumb" @click="go(c.path)">{{ c.name }}</button>
          </template>
        </nav>
        <span class="ex-spacer"></span>
        <button
          type="button"
          class="ex-sort"
          :title="`Nach Namen sortieren (${order === 'asc' ? 'aufsteigend' : 'absteigend'})`"
          @click="toggleOrder"
        >
          Name {{ order === 'asc' ? '↑' : '↓' }}
        </button>
        <button type="button" class="ex-refresh" title="Neu einlesen" @click="list">↻</button>
      </div>

      <div v-if="canManage" class="ex-actions">
        <button type="button" class="ex-new" @click="newFolder">＋ Ordner</button>
        <button type="button" class="ex-rename" :disabled="!current" @click="renameSelected">Umbenennen</button>
        <button type="button" class="ex-copy" :disabled="!current" @click="remember(false)">Kopieren</button>
        <button type="button" class="ex-cut" :disabled="!current" @click="remember(true)">Ausschneiden</button>
        <button type="button" class="ex-paste" :disabled="!clip" :title="clip ? `„${clip.name}“ hier einfügen` : ''" @click="paste">
          Einfügen
        </button>
        <button type="button" class="ex-delete" :disabled="!current" @click="trashSelected">Löschen</button>
        <span class="ex-spacer"></span>
        <button type="button" class="ex-trash-toggle" :class="{ on: showTrash }" @click="toggleTrash">
          🗑 Papierkorb
        </button>
      </div>

      <div v-if="showTrash" class="ex-main">
        <ul class="ex-list ex-trash">
          <li v-if="!trash.length" class="ex-empty">Der Papierkorb ist leer.</li>
          <li v-for="item in trash" :key="item.id" class="trash-item">
            <span class="entry-icon">{{ item.isDir ? '📁' : '📄' }}</span>
            <span class="entry-name">{{ item.name }}</span>
            <span class="trash-from">aus /{{ item.from }} · {{ when(item.deletedAt) }}</span>
            <button type="button" class="trash-restore" @click="restore(item)">Wiederherstellen</button>
          </li>
        </ul>
      </div>

      <div v-else class="ex-main">
        <ul class="ex-list">
          <li v-if="loading && !items.length" class="ex-empty">Wird gelesen …</li>
          <li v-else-if="!items.length" class="ex-empty">Dieser Ordner ist leer.</li>
          <li
            v-for="entry in items"
            :key="entry.path"
            class="entry"
            :class="{ dir: entry.isDir, active: entry.name === selected }"
            @click="onEntry(entry)"
            @dblclick="onEntryOpen(entry)"
          >
            <span class="entry-icon">{{ entry.isDir ? '📁' : '📄' }}</span>
            <span class="entry-name">{{ entry.name }}</span>
          </li>
        </ul>

        <FilePreview v-if="preview && root" :key="preview.path" :root="root" :entry="preview" class="ex-preview" />
      </div>

      <footer class="ex-status">
        <span v-if="error" class="ex-error">{{ error }}</span>
        <template v-else-if="showTrash">
          <span class="ex-count">{{ trash.length }} {{ trash.length === 1 ? 'Eintrag' : 'Einträge' }} im Papierkorb</span>
          <button type="button" class="ex-empty-trash" :disabled="!trash.length" @click="emptyTrash">
            Papierkorb leeren
          </button>
        </template>
        <template v-else>
          <span class="ex-count">{{ items.length }} {{ items.length === 1 ? 'Eintrag' : 'Einträge' }}</span>
          <span v-if="clip" class="ex-clip">{{ clip.cut ? 'Ausgeschnitten' : 'Kopiert' }}: {{ clip.name }}</span>
        </template>
      </footer>
    </template>

    <div v-else class="ex-setup">
      <p class="ex-hint">
        Für dieses Arbeitsverzeichnis ist noch kein Datenordner festgelegt — der Explorer zeigt
        genau diesen Ordner.
      </p>
      <button type="button" class="ex-choose" @click="shell.openSettings()">Datenordner festlegen …</button>
    </div>
  </div>
</template>

<style scoped>
.explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  padding: 10px 12px 8px;
  gap: 8px;
}
.ex-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ex-crumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  min-width: 0;
  font-size: 12px;
}
.ex-crumbs button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 7px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
}
.ex-crumbs button:hover {
  border-color: var(--border);
  color: var(--text);
}
.ex-sep {
  color: var(--muted);
  opacity: 0.6;
}
.ex-spacer {
  flex: 1;
}
.ex-sort,
.ex-refresh {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}
.ex-sort:hover,
.ex-refresh:hover {
  color: var(--text);
  border-color: var(--accent);
}
.ex-main {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 0;
}
.ex-preview {
  flex: 1.2;
  min-width: 0;
}
.ex-list {
  flex: 1;
  min-width: 0;
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
  cursor: default;
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
.ex-empty {
  padding: 8px;
  color: var(--muted);
  font-size: 12px;
}
.ex-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.ex-actions button {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}
.ex-actions button:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}
.ex-actions button:disabled {
  opacity: 0.45;
  cursor: default;
}
.ex-trash-toggle.on {
  color: #fff;
  border-color: var(--accent);
  background: var(--accent);
}
.trash-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 7px;
  font-size: 13px;
  user-select: none;
}
.trash-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.trash-from {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 11px;
}
.trash-restore,
.ex-empty-trash {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 8px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.trash-restore:hover,
.ex-empty-trash:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}
.ex-empty-trash:disabled {
  opacity: 0.45;
  cursor: default;
}
.ex-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
  min-height: 14px;
}
.ex-clip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}
.ex-error {
  color: #ffb3b3;
}
.ex-setup {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
}
.ex-hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  max-width: 40ch;
}
.ex-choose {
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
</style>
