<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getHost } from '@/services/host';
import { agentEventIcon, agentEventLabel } from '@/core/agent';
import { useElapsed } from '@/composables/useElapsed';
import { renderMarkdown } from '@/core/markdown';
import { refKey, refLabel } from '@/core/pick';
import type { AgentEvent, Attachment, ChatMessage, ElementRef, Framework } from '@/types';
import type { AssetInfo } from '@/core/assets';
// Dasselbe Zeichen wie in der Beigaben-Verwaltung (c0119) — eine Datei sieht
// überall gleich aus, wo sie auftaucht.
import { assetIcon } from '@/core/assetview';

/**
 * Der Chat einer App: Verlauf, Eingabe, Anhänge und der Fortschritt des
 * laufenden Laufs. Er wird eigens geöffnet (siehe components/AppWindow) und
 * gehört sichtbar zum Fenster seiner App — ein Kontext-Kärtchen, das das Ziel
 * benennt, braucht es darum nicht mehr.
 */
const props = defineProps<{
  busy: boolean;
  messages: ChatMessage[];
  /** Offene Rückfrage des LLM — klappt den Verlauf automatisch auf. */
  pendingQuestion: string | null;
  /** Live-Fortschritt des laufenden Laufs (was der Agent gerade tut). */
  activity?: AgentEvent[];
  /** Beginn des laufenden Laufs (ms) — daraus wächst die angezeigte Laufzeit. */
  startedAt?: number | null;
  /** Wie viele Wünsche für diese App noch warten (sie laufen nacheinander). */
  queued?: number;
  /**
   * Es entsteht gerade eine NEUE App — nur dann steht die Framework-Wahl zur
   * Debatte. Eine bestehende App bringt ihre Wahl selbst mit und wird nicht
   * noch einmal gefragt.
   */
  newApp?: boolean;
  /** Die aktuelle Framework-Wahl für die neue App. */
  framework?: Framework;
  /**
   * Der Entwurfs-Modus (e15) steht bereits offen — dann ist im leeren Verlauf
   * nichts mehr anzubieten: Die Zeichenfläche liegt schon da.
   */
  designOpen?: boolean;
  /** Gibt es überhaupt eine laufende App, in der man markieren kann? */
  canPick?: boolean;
  /** Der Anwender markiert gerade Elemente in der App (🎯). */
  picking?: boolean;
  /** Die bereits markierten Elemente — sie gehen mit dem nächsten Wunsch mit. */
  elements?: ElementRef[];
  /**
   * Die Beigaben, die in dieser App liegen (e16) — die Auswahl, aus der der
   * Anwender eine zu seinem Wunsch mitschickt (c0118). Eine App ohne Beigaben
   * (und jeder Entwurf) bekommt den Knopf dafür gar nicht erst zu sehen.
   */
  assets?: AssetInfo[];
}>();

const emit = defineEmits<{
  submit: [text: string, attachments: Attachment[], assets: string[]];
  'update:framework': [framework: Framework];
  'update:picking': [on: boolean];
  /** Ein Kärtchen wurde weggenommen (Selektor des Elements). */
  'remove-element': [key: string];
  /** Der Entwurfs-Modus soll aufgehen — aus dem leeren Verlauf heraus (i0009). */
  'open-design': [];
}>();

// Preact ist die Vorgabe — der Haken ist an, bis der Anwender ihn wegnimmt.
const preact = computed(() => props.framework !== 'vanilla');

function setPreact(on: boolean): void {
  emit('update:framework', on ? 'preact' : 'vanilla');
}

const text = ref('');
// Wer den Chat öffnet, will ihn sehen: Der Verlauf steht von Anfang an offen
// und lässt sich auf die reine Eingabezeile zuklappen.
const open = ref(true);
const attachments = ref<Attachment[]>([]);
// Die zu diesem Wunsch mitgeschickten Beigaben der App (c0118) — anders als ein
// Anhang aus dem Dateidialog liegt jede von ihnen schon in der App; mitgeschickt
// wird darum nur ihr Pfad dort.
const pickedAssets = ref<AssetInfo[]>([]);
const assetList = ref(false);
const attachError = ref<string | null>(null);
const panel = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);

// ---- Eigenes Chat-Fenster (Portal): dasselbe Vue-Kontextfenster rendert per
// Teleport in ein about:blank-Kindfenster. Es gibt KEINEN zweiten Renderer
// und keinen Zustandsabgleich — schließt das Fenster, dockt der Chat zurück.
const childWin = ref<Window | null>(null);
const portalTarget = ref<HTMLElement | null>(null);
let closeWatcher: ReturnType<typeof setInterval> | null = null;

const popped = computed(() => portalTarget.value !== null);
const teleportTarget = computed<HTMLElement | string>(() => portalTarget.value ?? 'body');
// Chromium macht Knoten, die in einem geschlossenen Fenster lagen, unbrauchbar:
// zurückgeschoben hängen sie zwar wieder im Dokument, ihre Ereignis-Handler
// feuern aber nie mehr — die Eingabe nähme nach dem Zurückholen nichts mehr an.
// Der Schlüssel wechselt darum mit dem Ort: Vue baut die Oberfläche jedes Mal
// frisch auf, statt dieselben Knoten hin- und herzuschieben. Der Zustand (Text,
// Anhänge) lebt in diesem Setup und übersteht den Neuaufbau.
const placeKey = computed(() => (popped.value ? 'windowed' : 'docked'));

// Zur Wahl steht, was die App hat und noch nicht am Wunsch hängt — was schon
// dranhängt, ein zweites Mal anzubieten, führte nur zu Doppelungen.
const freeAssets = computed(() =>
  (props.assets ?? []).filter((a) => !pickedAssets.value.some((p) => p.path === a.path)),
);

// Das Eingabefeld wächst mit dem Inhalt (bis zu 6 Zeilen).
const rows = computed(() => Math.min(6, Math.max(1, text.value.split('\n').length)));

// Die Schritte des laufenden Laufs als fertige Anzeigezeilen (Zeichen + Text).
const steps = computed(() =>
  (props.activity ?? []).map((event) => ({ icon: agentEventIcon(event), label: agentEventLabel(event) })),
);

// Ein Lauf kann lange bei einem Schritt verharren — die mitlaufende Laufzeit
// zeigt, dass er trotzdem lebt.
const elapsed = useElapsed(() => props.startedAt);
const runningLabel = computed(() =>
  elapsed.value ? `Der Agent arbeitet … (${elapsed.value})` : 'Der Agent arbeitet …',
);

function scrollDown(): void {
  void nextTick(() => {
    if (panel.value) panel.value.scrollTop = panel.value.scrollHeight;
  });
}

// Der Chat erscheint auf Zuruf — dann soll auch gleich getippt werden können.
onMounted(() => {
  void nextTick(() => input.value?.focus());
  scrollDown();
});

// Rückfrage des LLM → Verlauf zeigen: gedockt aufklappen, im Fenster fokussieren.
watch(() => props.pendingQuestion, (q) => {
  if (!q) return;
  if (popped.value) {
    try { childWin.value?.focus(); } catch { /* Fenster ggf. schon weg */ }
  } else {
    open.value = true;
  }
  scrollDown();
});
watch(() => props.messages.length, scrollDown);
watch(open, (o) => { if (o) scrollDown(); });

// Läuft ein Agentenlauf, zeigt der Chat ihn mit — er klappt dafür aber NICHT
// von selbst auf: Was der Agent tut, führt die Warteanzeige über der App vor;
// wer den ganzen Verlauf sehen will, klappt ihn selbst auf (und bleibt dann
// auch aufgeklappt).
watch(() => props.busy, (busy) => {
  if (busy) scrollDown();
}, { immediate: true });
watch(() => steps.value.length, scrollDown);

/** Kopiert die Styles der Host-Seite in das Kindfenster (Vue-scoped inklusive). */
function copyStyles(target: Document): void {
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    try {
      target.head.appendChild(target.importNode(node, true));
    } catch { /* einzelne Styles sind verzichtbar */ }
  }
}

function popOut(): void {
  if (popped.value) return;
  const win = window.open('', 'morphos-chat', 'popup=yes,width=440,height=680');
  if (!win) return;
  childWin.value = win;
  try {
    win.document.title = 'Morphos – Chat';
    copyStyles(win.document);
    win.document.body.style.margin = '0';
  } catch { /* Anzeige-Details sind verzichtbar */ }
  const root = win.document.createElement('div');
  root.className = 'chat-window-root';
  win.document.body.appendChild(root);
  portalTarget.value = root;
  // Das Zudocken passiert durch Schließen des Fensters — dafür gibt es kein
  // verlässliches Ereignis über Fenstergrenzen, daher zyklisch prüfen.
  closeWatcher = setInterval(() => {
    if (childWin.value?.closed) dockBack();
  }, 500);
  try { win.focus(); } catch { /* optional */ }
  scrollDown();
}

function dockBack(): void {
  if (closeWatcher) { clearInterval(closeWatcher); closeWatcher = null; }
  const win = childWin.value;
  childWin.value = null;
  portalTarget.value = null;
  if (win && !win.closed) {
    try { win.close(); } catch { /* schon geschlossen */ }
  }
  open.value = true; // der Verlauf war sichtbar — gedockt bleibt er es
  scrollDown();
}

onBeforeUnmount(() => dockBack());

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  send();
}

// Auch während ein Agent arbeitet, nimmt die Leiste Wünsche an — sie reihen
// sich ein und laufen nacheinander (siehe stores/agents).
function send(): void {
  const t = text.value.trim();
  if (!t) return;
  emit('submit', t, attachments.value.map((a) => ({ ...a })), pickedAssets.value.map((a) => a.path));
  text.value = '';
  attachments.value = [];
  pickedAssets.value = [];
  assetList.value = false;
}

async function attach(): Promise<void> {
  attachError.value = null;
  try {
    const res = await getHost().chooseAttachment();
    if (!res.ok || !res.attachment) {
      if (res.error) attachError.value = res.error;
      return;
    }
    if (!attachments.value.some((a) => a.path === res.attachment!.path)) {
      attachments.value.push(res.attachment);
    }
  } catch (err) {
    attachError.value = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Der Zielmodus: In ihm klickt der Anwender Elemente in der laufenden App an,
 * statt sie zu bedienen — jedes wird zu einem Kärtchen neben den Anhängen.
 */
function togglePick(): void {
  emit('update:picking', !props.picking);
}

function removeAttachment(path: string): void {
  attachments.value = attachments.value.filter((a) => a.path !== path);
}

/** Die Liste der Beigaben auf- bzw. zuklappen (📦). */
function toggleAssetList(): void {
  assetList.value = !assetList.value;
}

/** Eine Beigabe der App an diesen Wunsch hängen — danach ist die Liste wieder zu. */
function attachAsset(asset: AssetInfo): void {
  if (!pickedAssets.value.some((a) => a.path === asset.path)) pickedAssets.value.push({ ...asset });
  assetList.value = false;
}

function removeAsset(path: string): void {
  pickedAssets.value = pickedAssets.value.filter((a) => a.path !== path);
}

/** Cmd/Ctrl+V: Bilder aus der Zwischenablage (z. B. Screenshots) als Referenz anhängen. */
async function onPaste(e: ClipboardEvent): Promise<void> {
  const items = e.clipboardData?.items;
  if (!items) return;
  // Liegt ein Bild an? (Format egal — der Hauptprozess liest es nativ.)
  const hasImage = Array.from(items).some((item) => item.type.startsWith('image/'));
  if (!hasImage) return; // reinen Text normal einfügen lassen
  e.preventDefault();
  attachError.value = null;
  try {
    const res = await getHost().readClipboardImage();
    if (!res.ok || !res.attachment) {
      if (res.error) attachError.value = res.error;
      return;
    }
    if (!attachments.value.some((a) => a.path === res.attachment!.path)) {
      attachments.value.push(res.attachment);
    }
  } catch (err) {
    attachError.value = err instanceof Error ? err.message : String(err);
  }
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
</script>

<template>
  <div class="chatdock">
    <div v-if="popped" class="windowed-hint">
      💬 Der Chat läuft in einem eigenen Fenster.
      <button type="button" class="dock-back" @click="dockBack">Zurückholen</button>
    </div>

    <Teleport :key="placeKey" :to="teleportTarget" :disabled="!popped">
      <div class="chat-ui" :class="popped ? 'windowed' : 'docked'">
        <div v-if="popped || open" ref="panel" class="chat-panel">
          <div v-if="messages.length === 0" class="empty">
            <p class="empty-text">Noch kein Dialog — beschreibe unten, was die App können soll.</p>
            <!-- Beim Anlegen ist die Gliederung am meisten wert (e15/i0009), und
                 die leere Fläche ist die Stelle, an der man auf sie kommt: Wer
                 hier steht, hat noch nichts gesagt — hier gehört der Weg zum
                 Entwurf hin, nicht nur in die Titelleiste. Steht er schon offen,
                 ist nichts anzubieten. -->
            <template v-if="newApp && !designOpen">
              <p class="empty-text">Wie sie gegliedert sein soll, lässt sich auch aufzeichnen.</p>
              <button
                type="button"
                class="empty-design"
                title="Kästen aufziehen, an die sich der Agent hält — der Entwurf geht mit dem ersten Wunsch mit"
                @click="emit('open-design')"
              >
                📐 Entwurf zeichnen
              </button>
            </template>
          </div>
          <template v-for="(msg, i) in messages" :key="i">
            <!-- eslint-disable-next-line vue/no-v-html — renderMarkdown escapt sämtliches HTML zuerst -->
            <div v-if="msg.role === 'assistant'" class="msg assistant md" v-html="renderMarkdown(msg.text)"></div>
            <div v-else class="msg user">
              <div class="text">{{ msg.text }}</div>
              <div v-if="msg.attachments?.length || msg.assets?.length || msg.elements?.length" class="atts">
                <span v-for="name in msg.attachments" :key="name" class="att">📎 {{ name }}</span>
                <!-- Beigaben der App (c0118): eigenes Zeichen, denn sie liegen IN
                     der App und kamen nicht von außen. -->
                <span v-for="p in msg.assets" :key="p" class="att att-asset">📦 {{ p }}</span>
                <span v-for="label in msg.elements" :key="label" class="att">🎯 {{ label }}</span>
              </div>
              <div class="time">{{ fmt(msg.time) }}</div>
            </div>
          </template>

          <!-- Mitlaufender Fortschritt: was der Agent gerade tut — und was noch wartet. -->
          <div v-if="busy || queued" class="activity">
            <template v-if="busy">
              <div v-for="(step, i) in steps" :key="i" class="step">
                <span class="step-icon">{{ step.icon }}</span>
                <span class="step-label">{{ step.label }}</span>
              </div>
              <div class="step running">
                <span class="step-icon">⏳</span>
                <span class="step-label">{{ runningLabel }}</span>
              </div>
            </template>
            <div v-if="queued" class="step">
              <span class="step-icon">⏸</span>
              <span class="step-label">
                {{ queued === 1 ? 'Ein weiterer Wunsch wartet.' : `${queued} weitere Wünsche warten.` }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="attachments.length || pickedAssets.length || elements?.length" class="chips">
          <span v-for="a in attachments" :key="a.path" class="chip" :title="a.path">
            {{ a.kind === 'image' ? '🖼' : '📄' }} {{ a.name }}
            <button type="button" class="chip-del" title="Entfernen" @click="removeAttachment(a.path)">✕</button>
          </span>
          <!-- Beigaben der App: dieselbe Reihe, aber eigens gezeichnet — sie
               liegen bereits in der App und werden nur benannt (c0118). -->
          <span
            v-for="a in pickedAssets"
            :key="a.path"
            class="chip asset-chip"
            :title="`${a.path} — liegt in der App`"
          >
            📦 {{ a.name }}
            <button type="button" class="chip-del" title="Entfernen" @click="removeAsset(a.path)">✕</button>
          </span>
          <!-- Markierte Elemente der App: dieselbe Reihe wie die Anhänge — beides
               ist Beiwerk zum Wunsch, das mit ihm abgeschickt wird. -->
          <span
            v-for="ref in elements"
            :key="refKey(ref)"
            class="chip ref-chip"
            :title="ref.source ? `${ref.selector}\n${ref.source}` : ref.selector"
          >
            🎯 {{ refLabel(ref) }}
            <button type="button" class="chip-del" title="Entfernen" @click="emit('remove-element', refKey(ref))">
              ✕
            </button>
          </span>
        </div>
        <!-- Die Beigaben der App zur Auswahl — sie klappen über der Eingabe auf. -->
        <div v-if="assetList" class="asset-list">
          <button
            v-for="a in freeAssets"
            :key="a.path"
            type="button"
            class="asset-option"
            :title="a.path"
            @click="attachAsset(a)"
          >
            <span class="asset-icon">{{ assetIcon(a.mime) }}</span>
            <span class="asset-name">{{ a.name }}</span>
          </button>
          <p v-if="!freeAssets.length" class="asset-empty">Alle Beigaben dieser App hängen schon am Wunsch.</p>
        </div>
        <div v-if="attachError" class="attach-error">{{ attachError }}</div>

        <!-- Nur beim Anlegen: Womit soll die neue App gebaut werden? Danach
             steht die Wahl im Quelltext der App und wird nicht mehr gefragt. -->
        <label v-if="newApp" class="framework" title="Oberfläche und Zustand mit Preact + htm bauen (statt von Hand)">
          <input type="checkbox" :checked="preact" @change="setPreact(($event.target as HTMLInputElement).checked)" />
          <span class="framework-label">Mit Preact bauen</span>
        </label>

        <div class="inputrow">
          <button
            v-if="!popped"
            type="button"
            class="toggle"
            :title="open ? 'Chatverlauf zuklappen' : 'Chatverlauf aufklappen'"
            @click="open = !open"
          >
            {{ open ? '▾' : '▴' }}
          </button>
          <button
            v-if="!popped"
            type="button"
            class="popout"
            title="Chat in eigenem Fenster öffnen"
            @click="popOut"
          >
            ⧉
          </button>
          <button type="button" class="attach" title="Referenzdatei anhängen (Bild oder Text)" @click="attach">
            📎
          </button>
          <button
            v-if="assets?.length"
            type="button"
            class="attach-asset"
            :class="{ on: assetList }"
            title="Beigabe dieser App anhängen (liegt unter assets/ und wird dem Agenten mit ihrem Pfad genannt)"
            @click="toggleAssetList"
          >
            📦
          </button>
          <button
            v-if="canPick"
            type="button"
            class="pick"
            :class="{ on: picking }"
            :title="picking
              ? 'Markieren beenden (Esc)'
              : 'Element in der App markieren: anklicken, um sich im Wunsch darauf zu beziehen'"
            @click="togglePick"
          >
            🎯
          </button>
          <textarea
            ref="input"
            v-model="text"
            :rows="rows"
            :placeholder="busy
              ? 'Der Agent arbeitet — dein Wunsch reiht sich ein.'
              : 'Was soll die App können? (Enter sendet)'"
            title="Enter sendet, Shift+Enter macht eine neue Zeile, Cmd/Ctrl+V fügt ein Bild als Referenz an."
            @keydown="onKeydown"
            @paste="onPaste"
          ></textarea>
          <button type="button" class="send" :disabled="!text.trim()" @click="send">
            {{ busy ? 'Einreihen' : 'Senden' }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/*
 * Gedockt füllt der Chat die Composer-Leiste seines Fensters: Der Verlauf nimmt
 * sich, was übrig bleibt, und rollt in sich — der Rahmen begrenzt die Höhe
 * (siehe components/WindowFrame, .w-composer).
 */
.chatdock {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat-ui.docked {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.chat-ui.docked .chat-panel {
  flex: 1;
  min-height: 0;
}
/* Im eigenen Fenster füllt der Chat die ganze Fläche. */
.chat-ui.windowed {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100vh;
  padding: 12px;
  box-sizing: border-box;
  background: var(--bg, #0f1115);
}
.chat-ui.windowed .chat-panel {
  flex: 1;
  max-height: none;
}
.chat-panel {
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-2);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.windowed-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  font-size: 13px;
  padding: 8px 4px;
}
.dock-back {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
.dock-back:hover {
  border-color: var(--accent);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-align: center;
  margin: 8px 0;
  font-size: 13px;
}
.empty-text {
  margin: 0;
}
/* Der Weg zum Entwurf steht im leeren Verlauf — angeboten, nicht aufgedrängt. */
.empty-design {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 9px;
  padding: 5px 12px;
  margin-top: 2px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.empty-design:hover {
  border-color: var(--accent);
}
.msg {
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}
.msg.user {
  align-self: flex-end;
  max-width: 78%;
  padding: 8px 12px;
  border-radius: 12px;
  border-bottom-right-radius: 4px;
  background: var(--accent);
  color: #fff;
  white-space: pre-wrap;
}
/* Antworten des LLM: gerendertes Markdown, volle Breite, keine Sprechblase. */
.msg.assistant.md {
  align-self: stretch;
  max-width: none;
  padding: 2px 4px;
  color: var(--text);
}
.msg.assistant.md :deep(p) {
  margin: 0 0 8px;
}
.msg.assistant.md :deep(p:last-child) {
  margin-bottom: 0;
}
.msg.assistant.md :deep(h1),
.msg.assistant.md :deep(h2),
.msg.assistant.md :deep(h3),
.msg.assistant.md :deep(h4) {
  margin: 10px 0 6px;
  font-size: 14px;
}
.msg.assistant.md :deep(ul),
.msg.assistant.md :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}
.msg.assistant.md :deep(code) {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 1px 5px;
  font-size: 12px;
}
.msg.assistant.md :deep(pre) {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  overflow-x: auto;
  margin: 0 0 8px;
}
.msg.assistant.md :deep(pre code) {
  background: none;
  border: 0;
  padding: 0;
}
/* Fortschritt des laufenden Laufs — zurückhaltend, unter dem Verlauf. */
.activity {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-left: 2px solid var(--border);
  padding: 2px 0 2px 10px;
  margin: 2px 0 0 4px;
}
.step {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
  color: var(--muted);
}
.step-icon {
  flex-shrink: 0;
  font-size: 11px;
}
.step-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step.running {
  color: var(--text);
  opacity: 0.75;
}
.atts {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.att {
  font-size: 11px;
  opacity: 0.85;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  padding: 1px 6px;
}
.time {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 4px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px 8px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-del {
  background: none;
  border: 0;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  padding: 0;
}
.chip-del:hover {
  color: #ffb3b3;
}
.attach-error {
  color: #ffb3b3;
  font-size: 12px;
}
/* Die Framework-Wahl sitzt unauffällig über der Eingabe — sie ist eine Vorgabe,
   keine Frage, die den Blick vom Wunsch wegziehen soll. */
.framework {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.framework input {
  accent-color: var(--accent);
  cursor: pointer;
  margin: 0;
}
.framework:hover .framework-label {
  color: var(--text);
}
.inputrow {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.toggle,
.popout,
.attach,
.attach-asset,
.pick {
  flex-shrink: 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 14px;
  cursor: pointer;
}
.toggle:hover,
.popout:hover,
.attach:hover,
.attach-asset:hover,
.pick:hover {
  border-color: var(--accent);
}
/* Der Zielmodus läuft — der Knopf zeigt es, solange er an ist. */
.pick.on {
  border-color: var(--accent);
  background: var(--accent);
}
.ref-chip {
  border-color: var(--accent);
}
/* Die Liste steht offen — der Knopf zeigt es, wie beim Zielmodus auch. */
.attach-asset.on {
  border-color: var(--accent);
}
/* Eine Beigabe der App ist kein Anhang von außen: eigene Kante, eigenes
   Zeichen — im Kärtchen wie in der Nachricht (c0118). */
.asset-chip {
  border-color: #7fd1a8;
}
.att-asset {
  border-color: rgba(127, 209, 168, 0.7);
}
/* Die Beigaben der App zur Auswahl: eine kurze Liste über der Eingabe, die auf
   Zuruf aufgeht und sich mit der Wahl wieder schließt. */
.asset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  max-height: 140px;
  overflow-y: auto;
}
.asset-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 12px;
  padding: 3px 8px;
  cursor: pointer;
  max-width: 240px;
}
.asset-option:hover {
  border-color: #7fd1a8;
}
.asset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
textarea {
  flex: 1;
  resize: none;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.4;
}
textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.send {
  flex-shrink: 0;
  background: var(--accent);
  border: 0;
  color: #fff;
  border-radius: 10px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.send:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
