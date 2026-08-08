import { defineStore } from 'pinia';
import type { AgentEvent, AppData, AppDocs, Attachment, ChatMessage, SourceFile, VersionInfo } from '@/types';
import { getHost } from '@/services/host';
import { agentEventLabel } from '@/core/agent';
import { extractIcon, extractTitle } from '@/core/html';
import { EMPTY_DOCS, toDocs } from '@/core/docs';
import { DEFAULT_ICON, DEFAULT_NAME, makeAppId } from '@/core/app';

/** Deckel für den mitlaufenden Fortschritt — ein langer Lauf soll nicht wachsen ohne Ende. */
const MAX_ACTIVITY = 200;

// Jeder Agentenlauf bekommt eine eigene Id: Der Hauptprozess schickt seine
// Fortschrittsereignisse damit an genau das Fenster zurück, das ihn gestartet hat.
let runCounter = 0;
const nextRunId = (): string => `run-${(runCounter += 1)}`;

interface AppState {
  folder: string | null;
  id: string | null;
  name: string;
  icon: string;
  /** Das Icon stammt vom Anwender — keine Generierung überschreibt es. */
  iconCustom: boolean;
  createdAt: number;
  /** Der aktuelle Quelldatei-Satz der App (src/…). */
  files: SourceFile[];
  /** Das gebündelte Artefakt für die Anzeige im Canvas. */
  currentHtml: string;
  /** Konzept und Anleitung der App — vom LLM gepflegt, im Fenster lesbar. */
  docs: AppDocs;
  /** Git-Historie, neueste zuerst (HEAD = aktiver Stand). */
  versions: VersionInfo[];
  /** Dialogverlauf mit dem LLM (persistiert als chat.json, ohne Revert). */
  chat: ChatMessage[];
  /** Offene Rückfrage des LLM — die Oberfläche klappt dann den Chat auf. */
  pendingQuestion: string | null;
  /** Was der Agent im laufenden (bzw. zuletzt gelaufenen) Lauf getan hat. */
  activity: AgentEvent[];
  /** Beginn des laufenden Laufs (ms) — Grundlage der angezeigten Laufzeit; sonst null. */
  runStartedAt: number | null;
  /** Id des laufenden Laufs — mit ihr bricht der Hauptprozess ihn ab; sonst null. */
  runId: string | null;
  /** Der laufende Lauf wurde abgebrochen: sein Ergebnis wird verworfen. */
  aborted: boolean;
  busy: boolean;
  error: string | null;
}

/**
 * Zustand genau EINER geöffneten App (ein Desktop-Fenster). Prompts beziehen
 * sich stets auf diese App; jeder Stand wird als Git-Commit in ihrem Ordner
 * persistiert (Botschaft = Wunsch).
 *
 * Es ist eine FABRIK: jedes Fenster erhält über useAppWindow(instanceId) seinen
 * eigenen Store, sodass mehrere Apps gleichzeitig offen sein können. Pinia cacht
 * je Id — gleiche instanceId ⇒ derselbe Store.
 */
export function useAppWindow(instanceId: string) {
  return defineStore(`app-window-${instanceId}`, {
  state: (): AppState => ({
    folder: null,
    id: null,
    name: '',
    icon: '',
    iconCustom: false,
    createdAt: 0,
    files: [],
    currentHtml: '',
    docs: { ...EMPTY_DOCS },
    versions: [],
    chat: [],
    pendingQuestion: null,
    activity: [],
    runStartedAt: null,
    runId: null,
    aborted: false,
    busy: false,
    error: null,
  }),

  getters: {
    hasApp: (s): boolean => s.currentHtml.length > 0,
    /** Gibt es überhaupt etwas zu lesen (Konzept oder Anleitung)? */
    hasDocs: (s): boolean => s.docs.concept.length > 0 || s.docs.userdoc.length > 0,
    versionCount: (s): number => s.versions.length,
    isDraft: (s): boolean => s.id === null,
    /** Der aktive Stand ist immer der neueste Commit (HEAD). */
    activeSha: (s): string | null => s.versions[0]?.sha ?? null,
  },

  actions: {
    clearError(): void {
      this.error = null;
    },

    /** Beginnt eine neue, noch nicht gespeicherte App im gewählten Verzeichnis. */
    newDraft(folder: string): void {
      this.$reset();
      this.folder = folder;
    },

    /**
     * Öffnet eine bestehende App aus dem Verzeichnis. Der Zustand wird erst nach
     * dem Laden gesetzt (kein Flackern) — die Platte ist die maßgebliche Quelle,
     * es wird also stets der zuletzt committete Stand geladen.
     */
    async open(folder: string, id: string): Promise<boolean> {
      try {
        const data = await getHost().loadApp(folder, id);
        if (!data) {
          this.$reset();
          this.folder = folder;
          this.error = 'Die App konnte nicht geladen werden.';
          return false;
        }
        this.folder = folder;
        this.id = data.id;
        this.name = data.name;
        this.icon = data.icon;
        this.iconCustom = data.iconCustom === true;
        this.createdAt = data.createdAt;
        this.files = data.files;
        this.currentHtml = data.html;
        this.docs = toDocs(data.docs);
        this.chat = data.chat ?? [];
        this.pendingQuestion = null;
        this.activity = [];
        this.runStartedAt = null;
        this.runId = null;
        this.aborted = false;
        this.busy = false;
        this.error = null;
        await this.loadVersions();
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        return false;
      }
    },

    /**
     * Übernimmt das vom LLM im Artefakt hinterlegte Icon — es sei denn, der
     * Anwender hat selbst eines gesetzt. Dessen Wahl gilt für immer.
     */
    applyGeneratedIcon(html: string): void {
      if (this.iconCustom) return;
      this.icon = extractIcon(html) || DEFAULT_ICON;
    },

    /** Übernimmt ein anderswo (auf der Platte) gesetztes Icon in den Fensterzustand. */
    applyIcon(icon: string, custom: boolean): void {
      this.icon = icon;
      this.iconCustom = custom;
    },

    /**
     * Nimmt ein Fortschrittsereignis des laufenden Laufs auf. Gleich lautende
     * Ereignisse hintereinander (z. B. mehrfaches Nachdenken) werden zu einem
     * zusammengefasst, damit die Anzeige ruhig bleibt.
     */
    addActivity(event: AgentEvent): void {
      const last = this.activity[this.activity.length - 1];
      if (last && agentEventLabel(last) === agentEventLabel(event)) return;
      this.activity.push(event);
      if (this.activity.length > MAX_ACTIVITY) this.activity.splice(0, this.activity.length - MAX_ACTIVITY);
    },

    /**
     * Erzeugt oder verändert die App anhand des Wunsches. Das LLM kann statt
     * Änderungen auch eine Rückfrage stellen (pendingQuestion) — dann wird
     * nichts committet und der Anwender antwortet im Chat.
     *
     * Während der Lauf arbeitet, strömen seine Fortschrittsereignisse herein
     * (activity) — der Chat zeigt live, was der Agent gerade tut.
     */
    async generate(prompt: string, attachments: Attachment[] = []): Promise<void> {
      if (this.busy) return;
      const text = prompt.trim();
      if (!text) {
        this.error = 'Bitte gib einen Wunsch ein.';
        return;
      }

      this.error = null;
      this.busy = true;
      this.aborted = false;
      this.activity = [];
      this.runStartedAt = Date.now();
      const runId = nextRunId();
      this.runId = runId;
      const unsubscribe = getHost().onAgentEvent?.((id, event) => {
        if (id === runId) this.addActivity(event);
      });
      // Marke für einen etwaigen Abbruch: alles ab hier gehört diesem Lauf.
      const chatMark = this.chat.length;
      try {
        // Reine Werte übergeben (kein reaktiver Proxy) — Electron-IPC nutzt structured clone.
        const plainFiles = this.files.map((f) => ({ path: f.path, content: f.content }));
        const plainDocs = { concept: this.docs.concept, userdoc: this.docs.userdoc };
        const plainAtts = attachments.map((a) => ({ path: a.path, name: a.name, kind: a.kind }));
        // Der bisherige Dialog OHNE den aktuellen Wunsch — der geht separat in den Prompt.
        const priorChat = JSON.parse(JSON.stringify(this.chat)) as ChatMessage[];

        this.chat.push({
          role: 'user',
          text,
          ...(plainAtts.length ? { attachments: plainAtts.map((a) => a.name) } : {}),
          time: Date.now(),
        });
        this.pendingQuestion = null;

        const res = await getHost().generate(text, plainFiles, plainDocs, priorChat, plainAtts, runId);
        // Abgebrochen: Das (Teil-)Ergebnis wird verworfen und der Wunsch aus dem
        // Dialog genommen — die App bleibt, wie sie war, und der Abbruch selbst
        // ist kein Fehler.
        if (this.aborted) {
          this.chat.splice(chatMark);
          return;
        }
        if (!res.ok) {
          this.error = res.error;
          return;
        }

        if (res.files && res.html) {
          this.files = res.files;
          this.currentHtml = res.html;
          // Konzept und Anleitung sind Teil derselben Generierung.
          if (res.docs) this.docs = toDocs(res.docs);

          // Erste Version: Name und Icon aus dem Artefakt ableiten und Id/Ordner festlegen.
          if (this.id === null) {
            this.name = extractTitle(res.html) || DEFAULT_NAME;
            this.applyGeneratedIcon(res.html);
            this.id = makeAppId(this.name);
            this.createdAt = Date.now();
          }

          this.chat.push({ role: 'assistant', text: res.say || 'Umgesetzt.', time: Date.now() });
          await this.persist(text);
          await this.loadVersions();
        } else if (res.say) {
          // Reine Rückfrage: kein neuer Stand, der Chat wartet auf die Antwort.
          this.chat.push({ role: 'assistant', text: res.say, time: Date.now() });
          this.pendingQuestion = res.say;
        }

        await this.persistChat();
      } catch (err) {
        if (this.aborted) this.chat.splice(chatMark);
        else this.error = err instanceof Error ? err.message : String(err);
      } finally {
        unsubscribe?.();
        this.runStartedAt = null;
        this.runId = null;
        this.aborted = false;
        this.busy = false;
      }
    },

    /**
     * Bricht den laufenden Lauf ab: Der Hauptprozess beendet den zugehörigen
     * `claude`-Kindprozess, das Ergebnis wird verworfen. Ohne laufenden Lauf
     * passiert nichts.
     */
    abortRun(): void {
      if (!this.busy || this.aborted) return;
      this.aborted = true;
      if (!this.runId) return;
      // Scheitert der Abbruch, endet der Lauf eben regulär — sein Ergebnis wird
      // durch `aborted` ohnehin verworfen.
      void Promise.resolve(getHost().cancelAgent?.(this.runId)).catch(() => {});
    },

    /** Springt zu einer früheren Version zurück (neuer Commit mit dem alten Stand). */
    async revertTo(sha: string): Promise<void> {
      if (!this.folder || this.id === null) return;
      try {
        const res = await getHost().revertApp(this.folder, this.id, sha);
        if (!res.ok) {
          this.error = res.error ?? 'Die Version konnte nicht wiederhergestellt werden.';
          return;
        }
        // Wiederhergestellten Stand von der Platte übernehmen.
        await this.open(this.folder, this.id);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    },

    /** Lädt die Git-Historie der geöffneten App. */
    async loadVersions(): Promise<void> {
      if (!this.folder || this.id === null) return;
      try {
        this.versions = await getHost().listVersions(this.folder, this.id);
      } catch {
        this.versions = [];
      }
    },

    /** Persistiert den Dialogverlauf (erst möglich, sobald die App einen Ordner hat). */
    async persistChat(): Promise<void> {
      if (!this.folder || this.id === null) return;
      try {
        const plain = JSON.parse(JSON.stringify(this.chat)) as ChatMessage[];
        await getHost().saveChat(this.folder, this.id, plain);
      } catch {
        /* nicht kritisch */
      }
    },

    async persist(message: string): Promise<void> {
      if (!this.folder || this.id === null) return;
      // Als reines Objekt serialisieren: Pinia-State ist ein reaktiver Proxy, der
      // sich nicht über die Electron-IPC (structured clone) übertragen lässt.
      const data: AppData = JSON.parse(
        JSON.stringify({
          id: this.id,
          name: this.name,
          icon: this.icon,
          iconCustom: this.iconCustom,
          createdAt: this.createdAt,
          updatedAt: Date.now(),
          files: this.files,
          html: this.currentHtml,
          docs: this.docs,
        }),
      );
      try {
        const res = await getHost().saveApp(this.folder, data, message);
        if (!res.ok) this.error = res.error ?? 'Die App konnte nicht gespeichert werden.';
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    },
  },
  })();
}
