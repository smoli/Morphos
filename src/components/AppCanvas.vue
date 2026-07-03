<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
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

// Das Bridge-SDK (window.morphosFS) wird in das Dokument injiziert.
const srcdoc = computed(() => injectBridge(props.html));

const iframe = ref<HTMLIFrameElement | null>(null);

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
onBeforeUnmount(() => window.removeEventListener('message', onMessage));
</script>

<template>
  <iframe
    ref="iframe"
    class="canvas"
    :srcdoc="srcdoc"
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
