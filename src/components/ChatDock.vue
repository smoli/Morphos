<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { getHost } from '@/services/host';
import { agentEventIcon, agentEventLabel } from '@/core/agent';
import { useElapsed } from '@/composables/useElapsed';
import { renderMarkdown } from '@/core/markdown';
import type { AgentEvent, Attachment, ChatMessage } from '@/types';

const props = defineProps<{
  busy: boolean;
  messages: ChatMessage[];
  /** Offene Rückfrage des LLM — klappt den Verlauf automatisch auf. */
  pendingQuestion: string | null;
  /** Name der App, an die die Eingabe geht (zeigt dem Anwender das Ziel an). */
  contextLabel?: string | null;
  /** Live-Fortschritt des laufenden Laufs (was der Agent gerade tut). */
  activity?: AgentEvent[];
  /** Beginn des laufenden Laufs (ms) — daraus wächst die angezeigte Laufzeit. */
  startedAt?: number | null;
}>();

const emit = defineEmits<{ submit: [text: string, attachments: Attachment[]] }>();

const text = ref('');
const open = ref(false);
const attachments = ref<Attachment[]>([]);
const attachError = ref<string | null>(null);
const panel = ref<HTMLElement | null>(null);

// ---- Eigenes Chat-Fenster (Portal): dasselbe Vue-Kontextfenster rendert per
// Teleport in ein about:blank-Kindfenster. Es gibt KEINEN zweiten Renderer
// und keinen Zustandsabgleich — schließt das Fenster, dockt der Chat zurück.
const childWin = ref<Window | null>(null);
const portalTarget = ref<HTMLElement | null>(null);
let closeWatcher: ReturnType<typeof setInterval> | null = null;

const popped = computed(() => portalTarget.value !== null);
const teleportTarget = computed<HTMLElement | string>(() => portalTarget.value ?? 'body');

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

function send(): void {
  const t = text.value.trim();
  if (!t || props.busy) return;
  emit('submit', t, attachments.value.map((a) => ({ ...a })));
  text.value = '';
  attachments.value = [];
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

function removeAttachment(path: string): void {
  attachments.value = attachments.value.filter((a) => a.path !== path);
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

    <Teleport :to="teleportTarget" :disabled="!popped">
      <div class="chat-ui" :class="popped ? 'windowed' : 'docked'">
        <div v-if="popped || open" ref="panel" class="chat-panel" :class="{ overlay: !popped }">
          <p v-if="messages.length === 0" class="empty">Noch kein Dialog — beschreibe unten, was die App können soll.</p>
          <template v-for="(msg, i) in messages" :key="i">
            <!-- eslint-disable-next-line vue/no-v-html — renderMarkdown escapt sämtliches HTML zuerst -->
            <div v-if="msg.role === 'assistant'" class="msg assistant md" v-html="renderMarkdown(msg.text)"></div>
            <div v-else class="msg user">
              <div class="text">{{ msg.text }}</div>
              <div v-if="msg.attachments?.length" class="atts">
                <span v-for="name in msg.attachments" :key="name" class="att">📎 {{ name }}</span>
              </div>
              <div class="time">{{ fmt(msg.time) }}</div>
            </div>
          </template>

          <!-- Mitlaufender Fortschritt: was der Agent gerade tut. -->
          <div v-if="busy" class="activity">
            <div v-for="(step, i) in steps" :key="i" class="step">
              <span class="step-icon">{{ step.icon }}</span>
              <span class="step-label">{{ step.label }}</span>
            </div>
            <div class="step running">
              <span class="step-icon">⏳</span>
              <span class="step-label">{{ runningLabel }}</span>
            </div>
          </div>
        </div>

            <div v-if="contextLabel" class="chat-context" :title="`Deine Eingabe geht an: ${contextLabel}`">
          <span class="ctx-dot"></span>
          <span class="ctx-name">{{ contextLabel }}</span>
        </div>

        <div v-if="attachments.length" class="chips">
          <span v-for="a in attachments" :key="a.path" class="chip" :title="a.path">
            {{ a.kind === 'image' ? '🖼' : '📄' }} {{ a.name }}
            <button type="button" class="chip-del" title="Entfernen" @click="removeAttachment(a.path)">✕</button>
          </span>
        </div>
        <div v-if="attachError" class="attach-error">{{ attachError }}</div>

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
          <button type="button" class="attach" title="Referenzdatei anhängen (Bild oder Text)" :disabled="busy" @click="attach">
            📎
          </button>
          <textarea
            v-model="text"
            :rows="rows"
            :disabled="busy"
            placeholder="Was soll die App sein oder können? (Enter sendet, Shift+Enter neue Zeile, Bild einfügen mit Cmd/Ctrl+V)"
            @keydown="onKeydown"
            @paste="onPaste"
          ></textarea>
          <button type="button" class="send" :disabled="busy || !text.trim()" @click="send">
            {{ busy ? '…' : 'Senden' }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.chatdock {
  position: relative;
}
.chat-ui.docked {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
/* Gedockt liegt der Verlauf ÜBER der App (Overlay) statt sie zu verkleinern. */
.chat-panel.overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 10px);
  max-height: 48vh;
  z-index: 30;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.45);
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
  color: var(--muted);
  text-align: center;
  margin: 8px 0;
  font-size: 13px;
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
.chat-context {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 12px 3px 10px;
  font-size: 12px;
  color: var(--muted);
  max-width: 100%;
}
.ctx-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.ctx-name {
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.inputrow {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.toggle,
.popout,
.attach {
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
.attach:hover {
  border-color: var(--accent);
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
