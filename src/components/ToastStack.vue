<script setup lang="ts">
import { useNotificationsStore } from '@/stores/notifications';
import type { ToastKind } from '@/core/toasts';

const notes = useNotificationsStore();

const SIGNS: Record<ToastKind, string> = { info: 'ℹ', success: '✓', error: '!' };
</script>

<template>
  <div v-if="notes.toasts.length" class="toasts" aria-live="polite">
    <div
      v-for="toast in notes.toasts"
      :key="toast.id"
      class="toast"
      :class="toast.kind"
      :role="toast.kind === 'error' ? 'alert' : 'status'"
    >
      <span class="toast-sign" aria-hidden="true">{{ SIGNS[toast.kind] }}</span>
      <span class="toast-text">{{ toast.text }}</span>
      <button
        type="button"
        class="toast-close"
        title="Meldung schließen"
        aria-label="Meldung schließen"
        @click="notes.dismiss(toast.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* Der Stapel liegt über allem, fängt aber keine Klicks für die Fläche ab. */
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 10px;
  width: min(360px, 90vw);
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--muted);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  font-size: 13px;
  animation: toast-in 160ms ease-out;
}
.toast.success {
  border-left-color: #6cffa8;
}
.toast.error {
  border-left-color: var(--danger);
}
.toast.info {
  border-left-color: var(--accent);
}
.toast-sign {
  width: 18px;
  text-align: center;
  color: var(--muted);
}
.toast.success .toast-sign {
  color: #6cffa8;
}
.toast.error .toast-sign {
  color: var(--danger);
}
.toast.info .toast-sign {
  color: var(--accent);
}
.toast-text {
  overflow-wrap: anywhere;
  line-height: 1.4;
}
.toast-close {
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
}
.toast-close:hover {
  color: var(--text);
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
