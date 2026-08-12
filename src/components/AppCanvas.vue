<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { injectBridge, dispatchFsRequest } from '@/core/appfs';
import { injectPicker, sanitizeRef } from '@/core/pick';
import { dispatchDialogRequest } from '@/core/dialog';
import { getHost } from '@/services/host';
import FileDialog from './FileDialog.vue';
import type { DialogRequest, ElementRef, FsOp } from '@/types';

const props = defineProps<{
  html: string;
  accessRoot?: string | null;
  authorize?: (op: FsOp, path: string) => Promise<boolean>;
  /** Der Anwender markiert gerade Elemente in dieser App (siehe core/pick). */
  picking?: boolean;
}>();

const emit = defineEmits<{
  /** Ein Element wurde angeklickt — geprüfte Beschreibung für den Composer. */
  pick: [ref: ElementRef];
  /** Escape in der App: der Anwender verlässt den Pick-Modus. */
  'exit-pick': [];
}>();

// Bewusst OHNE allow-same-origin: der generierte Code bleibt isoliert und
// kann weder auf die Host-App noch auf Storage zugreifen. Der Dateisystem-
// Zugriff läuft ausschließlich über die kontrollierte postMessage-Brücke.
// Ebenso OHNE allow-popups: window.open wäre ein Kanal nach außen (URL-Parameter).
// Netzwerk-Requests blockiert die in injectBridge injizierte CSP.
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-pointer-lock';

const iframe = ref<HTMLIFrameElement | null>(null);

// Das Dokument (mit injiziertem Bridge-SDK) wird als blob:-URL geladen, NICHT
// über srcdoc. Beides ergibt in dieser Sandbox denselben opaken Origin und
// dieselbe Isolation — aber ein sandboxed srcdoc-Frame lässt Chromium bei jedem
// Commit "Hit debug scenario: 4" (Browser/Renderer-Origin-Abgleich) auf die
// Konsole schreiben; bei jedem Lauf des Agenten also eine ERROR-Zeile mehr.
const docUrl = ref('');

function loadDocument(html: string): void {
  const previous = docUrl.value;
  // Erst der Picker, dann die Brücke: Beide setzen ihr Skript an den Anfang des
  // Kopfes, die zuletzt eingesetzte CSP steht damit vor beiden.
  const doc = injectBridge(injectPicker(html));
  docUrl.value = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  // Das Freigeben löst nur die URL auf; das bereits geladene alte Dokument
  // bleibt bis zum Austausch stehen.
  if (previous) URL.revokeObjectURL(previous);
}

watch(() => props.html, loadDocument, { immediate: true });

// Der Dateidialog gehört zu DIESEM Fenster: Er liegt über der App, die ihn
// angefordert hat, und andere Fenster bleiben bedienbar.
const dialog = ref<{ request: DialogRequest; root: string } | null>(null);
let resolvePick: ((path: string | null) => void) | null = null;

/** Öffnet den Picker der Shell — genau einer zur Zeit je App. */
function showDialog(request: DialogRequest, root: string): Promise<string | null> {
  if (dialog.value) return Promise.reject(new Error('Es ist bereits ein Dateidialog geöffnet.'));
  dialog.value = { request, root };
  return new Promise<string | null>((resolve) => {
    resolvePick = resolve;
  });
}

/** Schließt den Picker und liefert das Ergebnis an die wartende App. */
function onPick(path: string | null): void {
  dialog.value = null;
  const resolve = resolvePick;
  resolvePick = null;
  resolve?.(path);
}

/**
 * Sagt dem Picker im iframe, ob gerade markiert wird. Die App bekommt dadurch
 * keine neue Fähigkeit — es ist dieselbe postMessage-Brücke wie beim Dateizugriff.
 */
function sendPickMode(on: boolean): void {
  iframe.value?.contentWindow?.postMessage({ __morphosPick: 'mode', on }, '*');
}

watch(() => props.picking, (on) => sendPickMode(!!on));

// Nach jeder Generierung lädt der iframe ein neues Dokument — der Picker darin
// weiß nichts vom laufenden Modus und muss ihn erneut gesagt bekommen.
function onLoad(): void {
  if (props.picking) sendPickMode(true);
}

async function onMessage(event: MessageEvent): Promise<void> {
  const win = iframe.value?.contentWindow;
  if (!win || event.source !== win) return; // nur Nachrichten des eigenen iframes
  const pick = event.data as { __morphosPick?: string; ref?: unknown };
  if (pick?.__morphosPick === 'picked') {
    const ref = sanitizeRef(pick.ref);
    if (ref) emit('pick', ref);
    return;
  }
  if (pick?.__morphosPick === 'exit') {
    emit('exit-pick');
    return;
  }

  const data = event.data as {
    __morphosFS?: string;
    id?: string;
    op?: FsOp;
    path?: string;
    data?: string;
    dialog?: string;
  };
  if (!data || data.__morphosFS !== 'request' || typeof data.id !== 'string') return;

  // Ein Dateidialog ist KEINE Dateisystem-Operation: Er läuft ohne
  // Berechtigungsprompt — erst das readFile/writeFile danach wird geprüft.
  const res =
    typeof data.dialog === 'string'
      ? await dispatchDialogRequest(data, props.accessRoot ?? null, (req) =>
          showDialog(req, props.accessRoot as string),
        )
      : await dispatchFsRequest(
          { op: data.op as FsOp, path: data.path ?? '', data: data.data },
          props.accessRoot ?? null,
          (root, req) => getHost().fs(root, req),
          props.authorize,
        );
  win.postMessage({ __morphosFS: 'response', id: data.id, ...res }, '*');
}

onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  // Ein noch offener Picker verschwindet mit dem Fenster — die wartende Zusage
  // der App darf dabei nicht hängen bleiben.
  if (dialog.value) onPick(null);
  if (docUrl.value) URL.revokeObjectURL(docUrl.value);
});
</script>

<template>
  <div class="canvas-wrap">
    <iframe
      ref="iframe"
      class="canvas"
      :src="docUrl"
      :sandbox="SANDBOX"
      referrerpolicy="no-referrer"
      @load="onLoad"
    ></iframe>
    <FileDialog v-if="dialog" :request="dialog.request" :root="dialog.root" @pick="onPick" />
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.canvas {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
</style>
