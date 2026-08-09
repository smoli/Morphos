<script setup lang="ts">
/**
 * Der Datei-Explorer der Schale — die Ansicht im System-Fenster „Dateien“.
 *
 * Er zeigt den Datenordner dieses Arbeitsverzeichnisses und dessen Unterordner,
 * und nur die: Gelesen wird über `getHost().fs`, das im Hauptprozess strikt auf
 * den Datenordner eingegrenzt wird (core/fsaccess) — über die Wurzel hinaus
 * führt kein Weg, auch nicht über die Wegmarken. Verborgenes (alles mit
 * führendem Punkt, künftig auch der Papierkorb) bleibt draußen; siehe
 * core/explorer.
 *
 * Die Liste läuft mit: Der Hauptprozess beobachtet den offenen Ordner
 * (core/watch) und meldet gebündelt, wenn sich dort etwas getan hat — dann wird
 * neu gelesen. Mit dem Ordnerwechsel wandert der Beobachter mit, mit dem
 * Fenster endet er.
 *
 * Vorschauen des ausgewählten Eintrags kommen in c0049, Verwalten und
 * Papierkorb in c0050.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getHost } from '@/services/host';
import { breadcrumbs, parentDir } from '@/core/dialog';
import { explorerEntries, type SortOrder } from '@/core/explorer';
import { useShellStore } from '@/stores/shell';
import { useWorkspaceStore } from '@/stores/workspace';
import type { FsEntry } from '@/types';

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
  await Promise.all([list(), rewatch()]);
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

// Ein neu festgelegter (oder gewechselter) Datenordner fängt oben wieder an.
watch(root, () => void go(''));

onMounted(() => void go(''));
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

      <footer class="ex-status">
        <span v-if="error" class="ex-error">{{ error }}</span>
        <span v-else class="ex-count">{{ items.length }} {{ items.length === 1 ? 'Eintrag' : 'Einträge' }}</span>
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
.ex-list {
  flex: 1;
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
.ex-status {
  font-size: 11px;
  color: var(--muted);
  min-height: 14px;
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
