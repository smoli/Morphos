<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { injectBridge, dispatchFsRequest } from '@/core/appfs';
import { getHost } from '@/services/host';
import type { FsOp } from '@/types';

const props = defineProps<{
  html: string;
  accessRoot?: string | null;
  authorize?: (op: FsOp, path: string) => Promise<boolean>;
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
  docUrl.value = URL.createObjectURL(new Blob([injectBridge(html)], { type: 'text/html' }));
  // Das Freigeben löst nur die URL auf; das bereits geladene alte Dokument
  // bleibt bis zum Austausch stehen.
  if (previous) URL.revokeObjectURL(previous);
}

watch(() => props.html, loadDocument, { immediate: true });

async function onMessage(event: MessageEvent): Promise<void> {
  const win = iframe.value?.contentWindow;
  if (!win || event.source !== win) return; // nur Nachrichten des eigenen iframes
  const data = event.data as { __morphosFS?: string; id?: string; op?: FsOp; path?: string; data?: string };
  if (!data || data.__morphosFS !== 'request' || typeof data.id !== 'string') return;

  const res = await dispatchFsRequest(
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
  if (docUrl.value) URL.revokeObjectURL(docUrl.value);
});
</script>

<template>
  <iframe
    ref="iframe"
    class="canvas"
    :src="docUrl"
    :sandbox="SANDBOX"
    referrerpolicy="no-referrer"
  ></iframe>
</template>

<style scoped>
.canvas {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
</style>
