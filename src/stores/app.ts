import { defineStore } from 'pinia';
import type { AgentEvent, AppDocs, Attachment, ChatMessage, ElementRef, Framework, SourceFile, VersionInfo } from '@/types';
// Das Modell des UI-Entwurfs ist rein (core/design) und darf darum auch hier
// laufen; auf die Platte greift allein der Hauptprozess (core/designstore), der
// über den Host erreicht wird.
import {
  DEFAULT_BLOCK_NAME,
  addBlock,
  clampRect,
  emptyDesign,
  makeBlockId,
  moveBlock,
  placeBlock,
  updateBlock,
  type Block,
  type Design,
  type Rect,
} from '@/core/design';
import { getHost } from '@/services/host';
import { agentEventLabel } from '@/core/agent';
import { refLabel } from '@/core/pick';
import { extractIcon } from '@/core/html';
import { EMPTY_DOCS, toDocs } from '@/core/docs';
import { DEFAULT_FRAMEWORK } from '@/core/framework';
import { DEFAULT_ICON } from '@/core/app';

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
  /**
   * Steht der Chat dieses Fensters offen? Er ist zunächst zu und geht auf
   * Zuruf auf (💬 in der Titelleiste, Tastenkürzel) — sowie von selbst bei
   * einem neuen Entwurf und bei einer Rückfrage des LLM.
   */
  composerOpen: boolean;
  /**
   * Liegt der Entwurfs-Modus über dieser App (e15)? Er zeigt den UI-Entwurf —
   * die Kästen, an die sich der Agent beim Bauen hält — als durchscheinende
   * Schicht über der laufenden App.
   */
  designOpen: boolean;
  /**
   * Der zuletzt gelesene Entwurf dieser App; null, solange keiner gelesen
   * wurde. Gelesen wird bei jedem Öffnen frisch von der Platte: Maßgeblich ist
   * die Datei, nicht was das Fenster einmal gesehen hat.
   */
  design: Design | null;
  /**
   * Womit eine NEUE App gebaut werden soll — die Wahl im Composer, die es nur
   * beim Anlegen gibt (Vorgabe: Preact). Eine bestehende App trägt ihre Wahl in
   * ihrem eigenen Quelltext; dieser Wert bleibt dann ohne Wirkung.
   */
  newFramework: Framework;
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
    composerOpen: false,
    designOpen: false,
    design: null,
    newFramework: DEFAULT_FRAMEWORK,
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
    /** Die Kästen des Entwurfs — ohne Entwurf schlicht keine. */
    designBlocks: (s): Block[] => s.design?.blocks ?? [],
    isDraft: (s): boolean => s.id === null,
    /** Der aktive Stand ist immer der neueste Commit (HEAD). */
    activeSha: (s): string | null => s.versions[0]?.sha ?? null,
  },

  actions: {
    clearError(): void {
      this.error = null;
    },

    /** Der Chat dieses Fensters — auf, zu, oder das eine wie das andere. */
    openComposer(): void {
      this.composerOpen = true;
    },
    closeComposer(): void {
      this.composerOpen = false;
    },
    toggleComposer(): void {
      this.composerOpen = !this.composerOpen;
    },

    /**
     * Der Entwurfs-Modus dieses Fensters (e15). Beim Aufgehen wird der Entwurf
     * frisch von der Platte gelesen — auch ein leerer: Die Schicht geht auf und
     * ist eben leer, denn noch keinen Entwurf zu haben ist der Normalfall.
     */
    async openDesign(): Promise<void> {
      await this.loadDesign();
      this.designOpen = true;
    },
    closeDesign(): void {
      this.designOpen = false;
    },
    async toggleDesign(): Promise<void> {
      if (this.designOpen) this.closeDesign();
      else await this.openDesign();
    },

    /**
     * Liest den Entwurf der App (design.ui.json) über den Host. Ein Entwurf,
     * der noch keine App ist, hat keinen; scheitert das Lesen oder fehlt die
     * Anbindung, bleibt es beim leeren Entwurf — der Entwurfs-Modus ist keine
     * Stelle, an der eine Fehlermeldung stünde.
     */
    async loadDesign(): Promise<void> {
      this.design = null;
      if (!this.folder || this.id === null) return;
      try {
        const design = await getHost().readDesign?.(this.folder, this.id);
        // Was über die Brücke kommt, wird hier nur noch als Baum angenommen,
        // wenn es einer ist (zurechtgerückt hat es der Hauptprozess).
        if (design && Array.isArray(design.blocks)) this.design = design;
      } catch {
        /* kein Entwurf ist kein Fehler */
      }
    },

    /**
     * Zeichnet einen neuen Kasten in den Entwurf (c0107): Die Lage kommt als
     * Anteil des Fensters von der Zeichenfläche, der Name aus dem Feld im
     * Kasten — ist er leer, bekommt er den Platzhalter. Zurück kommt die Id des
     * neuen Kastens, oder null, wenn nichts geschrieben wurde.
     */
    async addDesignBlock(rect: Rect, name = ''): Promise<string | null> {
      const block: Block = {
        id: makeBlockId(),
        name: name.trim() || DEFAULT_BLOCK_NAME,
        rect: clampRect(rect),
        children: [],
      };
      const ok = await this.saveDesign(addBlock(this.design ?? emptyDesign(), block));
      return ok ? block.id : null;
    },

    /** Gibt einem Kasten einen neuen Namen (leer: der Platzhalter). */
    async renameDesignBlock(id: string, name: string): Promise<void> {
      if (!this.design) return;
      await this.saveDesign(updateBlock(this.design, id, { name: name.trim() || DEFAULT_BLOCK_NAME }));
    },

    /**
     * Gibt einem Kasten seine Anweisungen bzw. seine Rolle (c0108) — beides
     * freiwillig: Leerer Text nimmt das Feld wieder weg (updateBlock), damit
     * weder in der Datei noch im Prompt leeres Zeug steht. Anders als beim Namen
     * gibt es hier keinen Platzhalter — nichts zu sagen ist der Normalfall.
     */
    async describeDesignBlock(id: string, patch: { instructions?: string; type?: string }): Promise<void> {
      if (!this.design) return;
      await this.saveDesign(updateBlock(this.design, id, patch));
    },

    /**
     * Schiebt einen Kasten an eine neue Stelle (c0109) — samt seiner Kinder:
     * Ihre Anteile beziehen sich aufs Fenster (c0104), also müssen sie
     * mitwandern, sonst rutschten sie aus ihrem Elter.
     */
    async moveDesignBlock(id: string, to: { x: number; y: number }): Promise<void> {
      if (!this.design) return;
      await this.saveDesign(placeBlock(this.design, id, to.x, to.y));
    },

    /**
     * Zieht einen Kasten an einer seiner Kanten größer oder kleiner (c0109).
     * Anders als beim Schieben bleiben die Kinder, wo sie sind — gemeint ist
     * dieser eine Kasten.
     */
    async resizeDesignBlock(id: string, rect: Partial<Rect>): Promise<void> {
      if (!this.design) return;
      await this.saveDesign(moveBlock(this.design, id, rect));
    },

    /**
     * Schreibt den Entwurf über den Host in den App-Ordner und übernimmt, was
     * dabei tatsächlich auf der Platte gelandet ist — maßgeblich ist die Datei,
     * nicht die Rechnung des Fensters. Anders als beim Lesen wird ein Fehlschlag
     * hier gesagt: Ein Zug, der nicht gespeichert ist, wäre stillschweigend
     * verloren. Ohne Anbindung (Renderer-Test) bleibt es beim eigenen Stand.
     */
    async saveDesign(design: Design): Promise<boolean> {
      if (!this.folder || this.id === null) return false;
      // Reine Werte übergeben (kein reaktiver Proxy) — Electron-IPC nutzt structured clone.
      const plain = JSON.parse(JSON.stringify(design)) as Design;
      const host = getHost();
      if (!host.writeDesign) {
        this.design = plain;
        return true;
      }
      try {
        const written = await host.writeDesign(this.folder, this.id, plain);
        if (!written || !Array.isArray(written.blocks)) {
          this.error = 'Der Entwurf konnte nicht gespeichert werden.';
          return false;
        }
        this.design = written;
        return true;
      } catch {
        this.error = 'Der Entwurf konnte nicht gespeichert werden.';
        return false;
      }
    },

    /**
     * Beginnt eine neue, noch nicht gespeicherte App im gewählten Verzeichnis.
     * Ihr Chat steht dabei sofort offen: Ein Entwurf hat noch nichts zu zeigen —
     * das Einzige, was hier zu tun ist, ist zu beschreiben, was er werden soll.
     */
    newDraft(folder: string): void {
      this.$reset();
      this.folder = folder;
      this.composerOpen = true;
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
     * Erzeugt oder verändert die App anhand des Wunsches. Der Agent arbeitet
     * dafür unmittelbar im Ordner der App (c0087): Hier geht nur der Wunsch
     * hinüber, zurück kommt der Stand, den die Schale committet hat — oder,
     * wenn der Agent nur gefragt hat, seine Rückfrage (pendingQuestion). Dann
     * wurde nichts committet und der Anwender antwortet im Chat.
     *
     * Während der Lauf arbeitet, strömen seine Fortschrittsereignisse herein
     * (activity) — der Chat zeigt live, was der Agent gerade tut.
     */
    async generate(prompt: string, attachments: Attachment[] = [], elements: ElementRef[] = []): Promise<void> {
      if (this.busy) return;
      const text = prompt.trim();
      if (!text) {
        this.error = 'Bitte gib einen Wunsch ein.';
        return;
      }
      if (!this.folder) {
        this.error = 'Es ist kein Arbeitsverzeichnis geöffnet.';
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
        const plainAtts = attachments.map((a) => ({ path: a.path, name: a.name, kind: a.kind }));
        const plainRefs = JSON.parse(JSON.stringify(elements)) as ElementRef[];
        // Der bisherige Dialog OHNE den aktuellen Wunsch — der geht separat in den Prompt.
        const priorChat = JSON.parse(JSON.stringify(this.chat)) as ChatMessage[];

        this.chat.push({
          role: 'user',
          text,
          ...(plainAtts.length ? { attachments: plainAtts.map((a) => a.name) } : {}),
          ...(plainRefs.length ? { elements: plainRefs.map(refLabel) } : {}),
          time: Date.now(),
        });
        this.pendingQuestion = null;

        // Die Framework-Wahl geht immer mit; für eine bestehende App entscheidet
        // ohnehin deren eigener Quelltext (siehe core/framework).
        const res = await getHost().generate(
          text, this.folder, this.id, priorChat, plainAtts, runId, this.newFramework, plainRefs,
        );
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

        // Hat der Lauf etwas geschrieben, steht der neue Stand schon auf der
        // Platte und ist committet — hier wird er nur übernommen.
        if (res.app) {
          this.id = res.app.id;
          this.name = res.app.name;
          this.icon = res.app.icon;
          this.iconCustom = res.app.iconCustom === true;
          this.createdAt = res.app.createdAt;
          this.files = res.app.files;
          this.currentHtml = res.app.html;
          this.docs = toDocs(res.app.docs);
        }

        const message = res.say?.trim() || (res.app ? 'Umgesetzt.' : res.question ?? '');
        if (message) this.chat.push({ role: 'assistant', text: message, time: Date.now() });
        else if (!res.app) this.error = 'Der Agent hat nichts geändert und nichts mitgeteilt.';

        // Rückfrage: Der Chat geht von selbst auf — eine übersehene Frage bliebe
        // sonst unbeantwortet stehen, und der Wunsch käme nie zum Ende.
        if (res.question) {
          this.pendingQuestion = res.question;
          this.composerOpen = true;
        }

        if (res.app) await this.loadVersions();
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

  },
  })();
}
