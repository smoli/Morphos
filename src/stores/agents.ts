import { defineStore } from 'pinia';
import type { Attachment, ElementRef } from '@/types';
import type { JobState } from '@/core/queue';
import { isAppBusy, MAX_RECENT_RUNS, startableJobs } from '@/core/queue';
import { DEFAULT_NAME } from '@/core/app';
import { useAppWindow } from './app';
import { useDesktopStore } from './desktop';
import { useWorkspaceStore } from './workspace';
import { useNotificationsStore } from './notifications';

/** Ein Agentenauftrag: ein Wunsch an eine App, der läuft oder auf seinen Platz wartet. */
export interface AgentJob {
  jobId: string;
  /**
   * Schlüssel für die Reihung je App: die App-Id, bzw. bei einem noch nicht
   * gespeicherten Entwurf die Instanz-Id seines Fensters.
   */
  appKey: string;
  state: JobState;
  /** Das Fenster, das den Wunsch abgeschickt hat (es darf zwischendurch zugehen). */
  instanceId: string;
  /** Id der App, sofern schon vergeben — sonst ein Entwurf. */
  appId: string | null;
  /** Anzeigename für die Liste in der Titelleiste. */
  label: string;
  prompt: string;
  attachments: Attachment[];
  /** In der App markierte Elemente, auf die sich der Wunsch bezieht (core/pick). */
  elements: ElementRef[];
  /** Beigaben der App, die mit dem Wunsch mitgehen — als ihre Pfade (c0118). */
  assets: string[];
  /** Abgebrochen: Das Ergebnis wird verworfen, der Auftrag ist aus der Liste. */
  cancelled: boolean;
}

/**
 * Ein erledigter Lauf, kurz vorgemerkt: Was ist zuletzt gelaufen und wie ist es
 * ausgegangen (siehe Telemetrie in den Einstellungen)? Abgebrochene Läufe
 * stehen hier nicht — sie sind keine Nachricht wert.
 */
export interface RecentRun {
  jobId: string;
  label: string;
  prompt: string;
  ok: boolean;
  error?: string;
  /** Zeitpunkt des Endes in Millisekunden. */
  time: number;
}

interface AgentsState {
  jobs: AgentJob[];
  /** Die jüngsten erledigten Läufe, neuester zuerst (höchstens MAX_RECENT_RUNS). */
  recent: RecentRun[];
}

type AppStore = ReturnType<typeof useAppWindow>;

let jobCounter = 0;
const nextJobId = (): string => `job-${(jobCounter += 1)}`;

/**
 * Die Instanz-Stores der LAUFENDEN Aufträge — außerhalb des States, weil ein
 * Store kein serialisierbarer Wert ist. Über sie wird ein Lauf abgebrochen,
 * auch wenn sein Fenster längst zu ist.
 */
const runningStores = new Map<string, AppStore>();

/**
 * Zentrale Warteschlange aller Agentenläufe (sitzungsweit, nach App geschlüsselt
 * — NICHT nach Fenster). Sie besitzt die Generierung: Ein Lauf überlebt sein
 * Fenster, und sein Ergebnis geht ins offene Fenster oder, wenn keines mehr da
 * ist, auf die Platte.
 *
 * Wie viele Läufe gleichzeitig arbeiten dürfen und wer als Nächstes drankommt,
 * entscheidet die framework-unabhängige Logik in core/queue.
 */
export const useAgentsStore = defineStore('agents', {
  state: (): AgentsState => ({
    jobs: [],
    recent: [],
  }),

  getters: {
    /** Laufende UND wartende Aufträge — die Zahl in der Titelleiste. */
    count: (s): number => s.jobs.length,
    runningJobs: (s): AgentJob[] => s.jobs.filter((j) => j.state === 'running'),
    queuedJobs: (s): AgentJob[] => s.jobs.filter((j) => j.state === 'queued'),
    /** Arbeitet (oder wartet) ein Agent für diese App? */
    isBusy: (s) => (appKey: string): boolean => isAppBusy(s.jobs, appKey),
    /**
     * Arbeitsanzeige eines Fensters: sein eigener Auftrag zählt, aber auch einer,
     * der für dieselbe App aus einem anderen (inzwischen geschlossenen) Fenster
     * heraus läuft.
     */
    isWindowBusy: (s) => (instanceId: string, appId?: string | null): boolean =>
      s.jobs.some((j) => j.instanceId === instanceId || (!!appId && j.appKey === appId)),
  },

  actions: {
    /**
     * Nimmt einen Wunsch für ein Fenster entgegen — er kommt aus dem Chat dieses
     * Fensters (siehe components/AppWindow). Er startet sofort, wenn ein Platz
     * frei ist und für die App gerade kein Agent arbeitet — sonst wartet er.
     * Liefert die Auftrags-Id (oder null, wenn nichts anzunehmen war).
     */
    submit(
      instanceId: string,
      prompt: string,
      attachments: Attachment[] = [],
      elements: ElementRef[] = [],
      assets: string[] = [],
    ): string | null {
      const text = prompt.trim();
      if (!text) return null;
      if (!useWorkspaceStore().folder) return null;

      const app = useAppWindow(instanceId);
      const win = useDesktopStore().find(instanceId);
      const appId = app.id ?? win?.appId ?? null;
      const job: AgentJob = {
        jobId: nextJobId(),
        appKey: appId ?? instanceId,
        state: 'queued',
        instanceId,
        appId,
        label: app.name || win?.title || DEFAULT_NAME,
        prompt: text,
        // Reine Werte: der Auftrag überlebt sein Fenster und dessen Store.
        attachments: attachments.map((a) => ({ ...a })),
        elements: elements.map((e) => ({ ...e })),
        assets: [...assets],
        cancelled: false,
      };
      this.jobs.push(job);
      this.pump();
      return job.jobId;
    },

    /**
     * Bricht einen Auftrag ab: Ein wartender verschwindet einfach, bei einem
     * laufenden wird zusätzlich der `claude`-Kindprozess beendet. Der Platz wird
     * erst frei, wenn der Lauf tatsächlich endet (siehe runJob).
     */
    cancel(jobId: string): void {
      const job = this.jobs.find((j) => j.jobId === jobId);
      if (!job) return;
      job.cancelled = true;
      this.jobs = this.jobs.filter((j) => j.jobId !== jobId);
      if (job.state === 'running') runningStores.get(jobId)?.abortRun();
    },

    /** Startet, was jetzt starten darf (Deckel und ein Agent je App). */
    pump(): void {
      for (const job of startableJobs(this.jobs, useWorkspaceStore().maxAgents)) {
        job.state = 'running';
        void this.runJob(job.jobId);
      }
    },

    /**
     * Führt einen Auftrag aus. Der Zustand kommt aus dem offenen Fenster — ist
     * es inzwischen zu, von der Platte (bzw. als neuer Entwurf). Der Lauf selbst
     * liegt im Instanz-Store, der ihn auch dann zu Ende bringt und speichert,
     * wenn sein Fenster mittendrin verschwindet.
     */
    async runJob(jobId: string): Promise<void> {
      const job = this.jobs.find((j) => j.jobId === jobId);
      if (!job) return;
      const folder = useWorkspaceStore().folder;
      if (!folder) {
        this.finish(jobId);
        return;
      }

      const openWindow = useDesktopStore().find(job.instanceId) ?? null;
      const store = useAppWindow(job.instanceId);
      // Erst eintragen, dann laden: Ein Abbruch in der Zwischenzeit findet den
      // Store und der Lauf beginnt gar nicht mehr.
      runningStores.set(jobId, store);
      try {
        if (!openWindow) {
          // Das Fenster ist zu: maßgeblich ist der zuletzt gespeicherte Stand.
          if (job.appId) await store.open(folder, job.appId);
          else if (!store.folder) store.newDraft(folder);
        }
        if (job.cancelled) return;

        await store.generate(job.prompt, job.attachments, job.elements, job.assets);
        this.announce(job, store);
        await this.afterRun(job, store);
      } finally {
        runningStores.delete(jobId);
        this.finish(jobId);
        this.pump();
      }
    },

    /**
     * Sagt der Schale Bescheid, wie der Lauf ausgegangen ist, und merkt ihn als
     * zuletzt gelaufen vor. Die Meldung gehört dem Meldungsstapel, nicht dem
     * Fenster — sie kommt auch an, wenn das auslösende Fenster längst zu ist.
     * Ein Abbruch ist keine Nachricht wert.
     */
    announce(job: AgentJob, store: AppStore): void {
      if (job.cancelled) return;
      const notes = useNotificationsStore();
      const label = store.name || job.label;
      if (store.error) notes.error(`${label}: ${store.error}`);
      else notes.success(`„${label}“ ist fertig.`);

      const run: RecentRun = {
        jobId: job.jobId,
        label,
        prompt: job.prompt,
        ok: !store.error,
        ...(store.error ? { error: store.error } : {}),
        time: Date.now(),
      };
      this.recent = [run, ...this.recent].slice(0, MAX_RECENT_RUNS);
    },

    /**
     * Nach dem Lauf: Entwurf → echte App im Fenster und in den Kacheln
     * nachziehen; lief er ohne sein Fenster, ein anderswo offenes Fenster
     * derselben App neu laden (dort steht sonst der alte Stand).
     */
    async afterRun(job: AgentJob, store: AppStore): Promise<void> {
      if (job.cancelled) return;
      const desktop = useDesktopStore();
      const ws = useWorkspaceStore();
      const openWindow = desktop.find(job.instanceId) ?? null;
      const appId = store.id;

      if (appId) {
        if (openWindow) desktop.setAppMeta(job.instanceId, appId, store.name, store.icon);
        // Aus dem Entwurf ist eine echte App geworden: seine wartenden Wünsche
        // gehören jetzt zu ihr (sonst liefe die Reihung je App ins Leere).
        if (!job.appId) this.rekey(job.instanceId, appId, store.name);
      }

      if (!openWindow) {
        if (appId && ws.folder) {
          const other = desktop.windows.find((w) => w.appId === appId);
          if (other) await useAppWindow(other.instanceId).open(ws.folder, appId);
        }
        // Der Store gehörte zu keinem Fenster mehr — er wird nicht mehr gebraucht.
        store.$dispose();
      }

      if (appId && !store.error) await ws.refresh();
    },

    /** Ein Entwurf hat eine App-Id bekommen — seine offenen Aufträge umschlüsseln. */
    rekey(instanceId: string, appId: string, label: string): void {
      for (const j of this.jobs) {
        if (j.instanceId !== instanceId || j.appId !== null) continue;
        j.appId = appId;
        j.appKey = appId;
        if (label) j.label = label;
      }
    },

    /** Nimmt einen erledigten Auftrag aus der Liste (der Platz wird frei). */
    finish(jobId: string): void {
      this.jobs = this.jobs.filter((j) => j.jobId !== jobId);
    },
  },
});
