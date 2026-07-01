<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import WelcomeScreen from '@/components/WelcomeScreen.vue';
import AppCanvas from '@/components/AppCanvas.vue';
import PromptBar from '@/components/PromptBar.vue';

const store = useAppStore();

function onRequest(text: string): void {
  void store.generate(text);
}
</script>

<template>
  <div class="workspace">
    <div class="stage">
      <AppCanvas v-if="store.hasApp" :html="store.currentHtml" />
      <WelcomeScreen v-else @pick="onRequest" />

      <div v-if="store.busy" class="loading">
        <div class="spinner"></div>
        <div>{{ store.hasApp ? 'Die Änderung wird umgesetzt …' : 'Die Anwendung wird entwickelt …' }}</div>
      </div>
    </div>

    <footer class="promptbar-wrap">
      <div v-if="store.error" class="error">{{ store.error }}</div>
      <PromptBar :busy="store.busy" @submit="onRequest" />
    </footer>
  </div>
</template>

<style scoped>
.workspace {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
}
.stage {
  position: relative;
  overflow: hidden;
}
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(15, 17, 21, 0.82);
  backdrop-filter: blur(3px);
  color: var(--muted);
}
.spinner {
  width: 46px;
  height: 46px;
  border: 4px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.promptbar-wrap {
  border-top: 1px solid var(--border);
  background: var(--panel);
  padding: 12px 16px;
}
.error {
  background: rgba(255, 108, 108, 0.12);
  border: 1px solid var(--danger);
  color: #ffb3b3;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 10px;
  font-size: 13px;
  white-space: pre-wrap;
}
</style>
