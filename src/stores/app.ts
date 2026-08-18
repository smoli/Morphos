import { defineStore } from 'pinia';
import type { AgentEvent, AppDocs, Attachment, ChatMessage, ElementRef, Framework, SourceFile, VersionInfo } from '@/types';
// Das Modell des UI-Entwurfs ist rein (core/design) und darf darum auch hier
// laufen; auf die Platte greift allein der Hauptprozess (core/designstore), der
// über den Host erreicht wird.
import {
  DEFAULT_BLOCK_NAME,
  addBlock,
  addView,
  canNestUnder,
  clampRect,
  containerFor,
  deleteBlock,
  emptyDesign,
  emptyView,
  findView,
  hasContent,
  inView,
  makeBlockId,
  moveBlock,
  nestBlock,
  normalizeDesign,
  placeBlock,
  removeView,
  updateBlock,
  updateView,
  viewTitleFor,
  type Block,
  type Design,
  type Rect,
  type View,
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
   * Welche Ansicht des Entwurfs das Fenster gerade zeigt (c0113); null, solange
   * es keine gibt. Sie gehört dem FENSTER und nicht der Datei: Wo man beim
   * Zeichnen gerade steht, ist kein Teil des Entwurfs — zwei Fenster derselben
   * App dürfen an verschiedenen Ansichten arbeiten.
   */
  designViewId: string | null;
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
    designViewId: null,
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
    /** Die Ansichten des Entwurfs (c0113) — ohne Entwurf schlicht keine. */
    designViews: (s): View[] => s.design?.views ?? [],
    /** Die gezeigte Ansicht — null, solange es keine gibt. */
    designView: (s): View | null => (s.design ? findView(s.design, s.designViewId) : null),
    /**
     * Die Kästen der gezeigten Ansicht: Zu sehen ist stets eine, und die Anteile
     * gelten je Ansicht für dasselbe Fenster.
     */
    designBlocks(s): Block[] {
      return (s.design ? findView(s.design, s.designViewId)?.blocks : null) ?? [];
    },
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
     * der noch keine App ist, hat keine Datei: Sein Entwurf lebt im Fenster und
     * bleibt genau so stehen (c0112) — es gibt nichts nachzulesen. Scheitert das
     * Lesen oder fehlt die Anbindung, bleibt es beim leeren Entwurf — der
     * Entwurfs-Modus ist keine Stelle, an der eine Fehlermeldung stünde.
     */
    async loadDesign(): Promise<void> {
      if (this.id === null) return;
      this.design = null;
      if (!this.folder) return;
      try {
        const design = await getHost().readDesign?.(this.folder, this.id);
        // Was über die Brücke kommt, wird hier nur noch als Entwurf angenommen,
        // wenn es einer ist (zurechtgerückt hat es der Hauptprozess).
        if (design && Array.isArray(design.views)) this.design = design;
      } catch {
        /* kein Entwurf ist kein Fehler */
      }
      this.keepDesignView();
    },

    /**
     * Sorgt dafür, dass das Fenster eine Ansicht zeigt, die es auch gibt
     * (c0113): Die bisherige bleibt, solange sie im neuen Entwurf steht — sonst
     * ist es die erste. Ohne Ansichten ist es keine.
     *
     * Nötig nach jedem neuen Stand: Der Entwurf kommt frisch von der Platte
     * (oder aus dem Hauptprozess zurück), die gezeigte Ansicht steht dagegen im
     * Fenster — beides muss zusammenpassen, sonst zeigte die Schicht die Kästen
     * einer Ansicht, die es nicht mehr gibt.
     */
    keepDesignView(id?: string | null): void {
      const wanted = id === undefined ? this.designViewId : id;
      const views = this.design?.views ?? [];
      this.designViewId = (views.find((v) => v.id === wanted) ?? views[0])?.id ?? null;
    },

    /** Zeigt eine andere Ansicht (c0113) — eine unbekannte Id ändert nichts. */
    selectDesignView(id: string): void {
      if (!this.design || !findView(this.design, id)) return;
      this.designViewId = id;
    },

    /**
     * Legt eine weitere Ansicht an (c0113) und zeigt sie. Sie ist leer und heißt
     * vorerst nach ihrer Nummer — Titel und Beschreibung gibt ihr der Anwender.
     * Zurück kommt ihre Id, oder null, wenn nichts geschrieben wurde.
     */
    async addDesignView(): Promise<string | null> {
      const design = this.design ?? emptyDesign();
      const view = emptyView(viewTitleFor(design.views.length));
      const next = addView(design, view);
      if (next === design) return null;
      const ok = await this.saveDesign(next);
      if (!ok) return null;
      this.keepDesignView(view.id);
      return this.designViewId === view.id ? view.id : null;
    },

    /**
     * Gibt einer Ansicht ihren Titel bzw. ihre Beschreibung (c0113). Ein leerer
     * Titel bleibt unbeachtet — eine Ansicht ohne Titel gibt es nicht
     * (core/design: updateView); eine leere Beschreibung nimmt das Feld weg.
     */
    async describeDesignView(id: string, patch: { title?: string; description?: string }): Promise<void> {
      if (!this.design) return;
      const next = updateView(this.design, id, patch);
      if (next === this.design) return;
      await this.saveDesign(next);
    },

    /**
     * Wirft eine Ansicht samt ihren Kästen weg (c0113). Gezeigt wird danach die
     * erste, die übrig ist — und war es die letzte, hat der Entwurf eben keine
     * mehr: Der nächste gezeichnete Kasten legt wieder eine an.
     */
    async deleteDesignView(id: string): Promise<void> {
      if (!this.design) return;
      const next = removeView(this.design, id);
      if (next === this.design) return;
      await this.saveDesign(next);
      this.keepDesignView();
    },

    /**
     * Zeichnet einen neuen Kasten in den Entwurf (c0107): Die Lage kommt als
     * Anteil des Fensters von der Zeichenfläche, der Name aus dem Feld im
     * Kasten — ist er leer, bekommt er den Platzhalter. Zurück kommt die Id des
     * neuen Kastens, oder null, wenn nichts geschrieben wurde.
     *
     * Wo er landet, sagt seine Lage (c0110): In einen bestehenden Kasten
     * gezeichnet wird er dessen Kind, sonst hängt er an der Wurzel. Und er
     * landet in der GEZEIGTEN Ansicht (c0113) — gibt es noch keine, entsteht
     * sie mit ihm: Wer zeichnen will, soll nicht erst eine Ansicht anlegen
     * müssen.
     */
    async addDesignBlock(rect: Rect, name = ''): Promise<string | null> {
      const block: Block = {
        id: makeBlockId(),
        name: name.trim() || DEFAULT_BLOCK_NAME,
        rect: clampRect(rect),
        children: [],
      };
      let design = this.design ?? emptyDesign();
      let viewId = findView(design, this.designViewId)?.id ?? null;
      if (!viewId) {
        const first = emptyView(viewTitleFor(design.views.length));
        design = addView(design, first);
        viewId = findView(design, first.id)?.id ?? null;
        if (!viewId) return null;
      }
      const next = inView(design, viewId, (view) => {
        const parent = containerFor(view, block.rect)?.id ?? null;
        // Zu tief geschachtelt fiele der Kasten beim Speichern weg — dann hängt
        // er lieber an der Wurzel als nirgends.
        return addBlock(view, block, canNestUnder(view, parent) ? parent : null);
      });
      const ok = await this.saveDesign(next);
      if (!ok) return null;
      this.keepDesignView(viewId);
      return block.id;
    },

    /** Gibt einem Kasten einen neuen Namen (leer: der Platzhalter). */
    async renameDesignBlock(id: string, name: string): Promise<void> {
      await this.changeDesignView((view) => updateBlock(view, id, { name: name.trim() || DEFAULT_BLOCK_NAME }));
    },

    /**
     * Der gemeinsame Weg aller Kasten-Züge (c0113): Sie gelten der GEZEIGTEN
     * Ansicht, und was sich nicht ändert, wird nicht geschrieben.
     */
    async changeDesignView(change: (view: View) => View): Promise<void> {
      if (!this.design) return;
      const next = inView(this.design, this.designViewId, change);
      if (next === this.design) return;
      await this.saveDesign(next);
    },

    /**
     * Gibt einem Kasten seine Anweisungen bzw. seine Rolle (c0108) — beides
     * freiwillig: Leerer Text nimmt das Feld wieder weg (updateBlock), damit
     * weder in der Datei noch im Prompt leeres Zeug steht. Anders als beim Namen
     * gibt es hier keinen Platzhalter — nichts zu sagen ist der Normalfall.
     */
    async describeDesignBlock(id: string, patch: { instructions?: string; type?: string }): Promise<void> {
      await this.changeDesignView((view) => updateBlock(view, id, patch));
    },

    /**
     * Schiebt einen Kasten an eine neue Stelle (c0109) — samt seiner Kinder:
     * Ihre Anteile beziehen sich aufs Fenster (c0104), also müssen sie
     * mitwandern, sonst rutschten sie aus ihrem Elter.
     *
     * Wo er hinterher liegt, sagt auch, wo er hinterher HÄNGT (c0110): In einen
     * anderen Kasten geschoben wird er dessen Kind, herausgeschoben hängt er sich
     * um — bis zur Wurzel.
     */
    async moveDesignBlock(id: string, to: { x: number; y: number }): Promise<void> {
      await this.changeDesignView((view) => nestBlock(placeBlock(view, id, to.x, to.y), id));
    },

    /**
     * Zieht einen Kasten an einer seiner Kanten größer oder kleiner (c0109).
     * Anders als beim Schieben bleiben die Kinder, wo sie sind — gemeint ist
     * dieser eine Kasten. Auch er hängt sich um, wenn er hinterher woanders liegt
     * (c0110): Wer seinen Kasten aus dem Elter herauszieht, meint das.
     */
    async resizeDesignBlock(id: string, rect: Partial<Rect>): Promise<void> {
      await this.changeDesignView((view) => nestBlock(moveBlock(view, id, rect), id));
    },

    /**
     * Löscht einen Kasten (c0110). Seine Kinder rücken an seine Stelle — gelöscht
     * ist der Rahmen, nicht der Inhalt (core/design: deleteBlock). Gibt es den
     * Kasten nicht (mehr), wird nichts geschrieben.
     */
    async deleteDesignBlock(id: string): Promise<void> {
      await this.changeDesignView((view) => deleteBlock(view, id));
    },

    /**
     * Schreibt den Entwurf über den Host in den App-Ordner und übernimmt, was
     * dabei tatsächlich auf der Platte gelandet ist — maßgeblich ist die Datei,
     * nicht die Rechnung des Fensters. Anders als beim Lesen wird ein Fehlschlag
     * hier gesagt: Ein Zug, der nicht gespeichert ist, wäre stillschweigend
     * verloren. Ohne Anbindung (Renderer-Test) bleibt es beim eigenen Stand.
     */
    async saveDesign(design: Design): Promise<boolean> {
      if (!this.folder) return false;
      // Reine Werte übergeben (kein reaktiver Proxy) — Electron-IPC nutzt structured clone.
      const plain = JSON.parse(JSON.stringify(design)) as Design;
      // Ein Entwurf ohne App hat keinen Ordner, in den etwas geschrieben werden
      // könnte (c0112): Sein Entwurf bleibt im Fenster und geht mit dem ersten
      // Wunsch mit. Zurechtgerückt wird er trotzdem — sonst stünde im Fenster
      // etwas anderes, als hinterher in der Datei stünde.
      if (this.id === null) {
        this.design = normalizeDesign(plain);
        this.keepDesignView();
        return true;
      }
      const host = getHost();
      if (!host.writeDesign) {
        this.design = plain;
        this.keepDesignView();
        return true;
      }
      try {
        const written = await host.writeDesign(this.folder, this.id, plain);
        if (!written || !Array.isArray(written.views)) {
          this.error = 'Der Entwurf konnte nicht gespeichert werden.';
          return false;
        }
        this.design = written;
        this.keepDesignView();
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

        // Der gezeichnete UI-Entwurf geht nur bei einer NEUEN App mit (c0112):
        // Sie hat noch keinen Ordner, in dem er läge. Eine bestehende App hat
        // ihre design.ui.json — dort liest der Lauf ihn selbst, und was das
        // Fenster mitschickte, wäre bestenfalls dasselbe.
        const plainDesign = this.id === null && this.design && hasContent(this.design)
          ? (JSON.parse(JSON.stringify(this.design)) as Design)
          : undefined;

        // Die Framework-Wahl geht immer mit; für eine bestehende App entscheidet
        // ohnehin deren eigener Quelltext (siehe core/framework).
        const res = await getHost().generate(
          text, this.folder, this.id, priorChat, plainAtts, runId, this.newFramework, plainRefs, plainDesign,
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

        // Aus dem Entwurf ist eine App geworden: Ihr UI-Entwurf liegt nun in
        // ihrem Ordner (der Lauf hat den mitgebrachten dort abgelegt, c0112).
        // Von hier an ist die Datei maßgeblich, also wird sie gelesen.
        const born = this.id === null && !!res.app;

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
        if (born) await this.loadDesign();
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
