<script setup lang="ts">
/**
 * Einstellungs-Bereich „Telemetrie“: Was tun die Agenten gerade, und wie viel
 * Platz belegen die Apps?
 *
 * Die Aktivität kommt aus der Warteschlange (stores/agents) und ist damit
 * immer aktuell. Der Platzbedarf wird im HAUPTPROZESS gerechnet (host.diskUsage
 * → core/diskusage): Der Renderer läuft nie selbst über das Dateisystem und
 * wartet auch nicht auf die Rechnung — sie kommt nach und die Aktivität steht
 * derweil schon da.
 */
import { computed, onMounted, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAgentsStore } from '@/stores/agents';
import { useWorkspaceStore } from '@/stores/workspace';
import { getHost } from '@/services/host';
import { formatBytes } from '@/core/bytes';
import type { DiskUsage } from '@/types';

const agents = useAgentsStore();
const workspace = useWorkspaceStore();

const usage = ref<DiskUsage | null>(null);
const calculating = ref(false);
const error = ref<string | null>(null);

/** Der größte App-Ordner — er gibt den vollen Balken vor. */
const largest = computed(() => usage.value?.apps.reduce((max, a) => Math.max(max, a.bytes), 0) ?? 0);

function barWidth(bytes: number): string {
  if (largest.value <= 0) return '0%';
  return `${Math.max(2, Math.round((bytes / largest.value) * 100))}%`;
}

function runTime(time: number): string {
  return new Date(time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Holt den Platzbedarf beim Öffnen und auf Knopfdruck neu. */
async function load(): Promise<void> {
  if (calculating.value) return;
  const folder = workspace.folder;
  if (!folder) {
    error.value = 'Kein Arbeitsverzeichnis geöffnet.';
    return;
  }
  const measure = getHost().diskUsage;
  if (!measure) {
    error.value = 'Der Platzbedarf ist hier nicht verfügbar.';
    return;
  }
  calculating.value = true;
  error.value = null;
  try {
    const res = await measure(folder);
    if (res.ok) {
      usage.value = res.usage;
    } else {
      usage.value = null;
      error.value = res.error;
    }
  } catch (err) {
    usage.value = null;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    calculating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="telemetry">
    <section class="block">
      <h3>Agenten-Aktivität</h3>
      <p class="hint">
        Was gerade gearbeitet wird und was noch wartet — die Warteschlange aller Wünsche dieser Sitzung.
      </p>

      <div class="stats">
        <span class="stat stat-running">
          <strong class="stat-value">{{ agents.runningJobs.length }}</strong>
          <span class="stat-label">laufend</span>
        </span>
        <span class="stat stat-queued">
          <strong class="stat-value">{{ agents.queuedJobs.length }}</strong>
          <span class="stat-label">wartend</span>
        </span>
        <span class="stat stat-max">
          <strong class="stat-value">{{ workspace.maxAgents }}</strong>
          <span class="stat-label">Deckel</span>
        </span>
      </div>

      <ul v-if="agents.jobs.length" class="jobs">
        <li v-for="job in agents.jobs" :key="job.jobId" :class="job.state">
          <span class="job-state">{{ job.state === 'running' ? '▶' : '⏸' }}</span>
          <span class="job-text">
            <span class="job-label">{{ job.label }}</span>
            <span class="job-prompt">{{ job.prompt }}</span>
          </span>
        </li>
      </ul>
      <p v-else class="muted jobs-empty">Zurzeit arbeitet kein Agent.</p>

      <template v-if="agents.recent.length">
        <h4>Zuletzt gelaufen</h4>
        <ul class="runs">
          <li v-for="run in agents.recent" :key="run.jobId" :class="run.ok ? 'ok' : 'failed'">
            <span class="run-mark">{{ run.ok ? '✓' : '✕' }}</span>
            <span class="job-text">
              <span class="job-label">{{ run.label }}</span>
              <span class="job-prompt">{{ run.error ?? run.prompt }}</span>
            </span>
            <span class="run-time">{{ runTime(run.time) }}</span>
          </li>
        </ul>
      </template>
    </section>

    <section class="block space">
      <h3>Speicherplatz</h3>
      <p class="hint">
        Wie viel die Apps dieses Arbeitsverzeichnisses und ihr Datenordner belegen. Gerechnet wird
        beim Öffnen — bei vielen Apps dauert das einen Moment.
      </p>

      <div class="space-head">
        <button type="button" class="btn refresh" :disabled="calculating" @click="load">
          Neu berechnen
        </button>
        <span v-if="calculating" class="muted calculating">wird berechnet …</span>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="usage">
        <ul class="usage">
          <li v-for="app in usage.apps" :key="app.id">
            <AppIcon :icon="app.icon" :size="16" />
            <span class="usage-name" :title="app.name">{{ app.name }}</span>
            <span class="usage-bar"><span class="usage-fill" :style="{ width: barWidth(app.bytes) }" /></span>
            <span class="usage-size">{{ formatBytes(app.bytes) }}</span>
          </li>
        </ul>
        <p v-if="!usage.apps.length" class="muted">In diesem Arbeitsverzeichnis liegt noch keine App.</p>

        <dl class="totals">
          <div class="total-apps">
            <dt>Apps gesamt</dt>
            <dd>{{ formatBytes(usage.appsBytes) }}</dd>
          </div>
          <div class="total-data">
            <dt>Datenordner</dt>
            <dd v-if="usage.data">
              <code :title="usage.data.path">{{ usage.data.path }}</code>
              {{ formatBytes(usage.data.bytes) }}
            </dd>
            <dd v-else class="muted">Kein Datenordner festgelegt.</dd>
          </div>
        </dl>
      </template>
    </section>
  </div>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.space {
  margin-top: 26px;
}
.stats {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 12px;
}
.stat-value {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.stat-label {
  font-size: 12px;
  color: var(--muted);
}
.jobs,
.runs,
.usage {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.jobs li,
.runs li,
.usage li {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 6px 10px;
  font-size: 12px;
}
.job-state,
.run-mark {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
}
.jobs li.running .job-state {
  color: var(--accent);
}
.runs li.ok .run-mark {
  color: var(--accent);
}
.runs li.failed .run-mark {
  color: #ffb3b3;
}
.job-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.job-label {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-prompt {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.run-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
h4 {
  margin: 16px 0 6px;
  font-size: 13px;
  color: var(--muted);
}
.space-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.error {
  margin: 0 0 12px;
  font-size: 13px;
  color: #ffb3b3;
}
.usage-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.usage-bar {
  flex: 0 0 90px;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  overflow: hidden;
}
.usage-fill {
  display: block;
  height: 100%;
  background: var(--accent);
}
.usage-size {
  flex: 0 0 68px;
  text-align: right;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.totals {
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.totals > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.totals dt {
  color: var(--muted);
  flex: 0 0 120px;
}
.totals dd {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.totals code {
  font-size: 12px;
  color: var(--muted);
}
</style>
