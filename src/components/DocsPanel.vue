<script setup lang="ts">
/**
 * Nur-Lese-Ansicht der beiden Dokumente einer App (Konzept und Anleitung).
 * Gepflegt werden sie vom LLM; der Anwender liest hier mit, was seine App
 * sein soll und wie man sie bedient. Gerendert wird mit core/markdown —
 * escape-first, es kann also kein Markup aus dem Dokument entkommen.
 */
import { computed, ref } from 'vue';
import { renderMarkdown } from '@/core/markdown';
import type { AppDocs } from '@/types';

const props = defineProps<{ docs: AppDocs }>();
defineEmits<{ close: [] }>();

type Tab = 'concept' | 'userdoc';

const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'concept', label: 'Konzept', empty: 'Für diese App gibt es noch kein Konzept.' },
  { key: 'userdoc', label: 'Anleitung', empty: 'Für diese App gibt es noch keine Anleitung.' },
];

const tab = ref<Tab>('concept');
const current = computed(() => TABS.find((t) => t.key === tab.value)!);
const text = computed(() => (tab.value === 'concept' ? props.docs.concept : props.docs.userdoc).trim());
const html = computed(() => renderMarkdown(text.value));
</script>

<template>
  <div class="docs-panel">
    <div class="docs-head">
      <span class="docs-tabs">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          class="docs-tab"
          :class="{ active: t.key === tab }"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </span>
      <button type="button" class="docs-close" @click="$emit('close')">Schließen</button>
    </div>

    <div class="docs-body">
      <p v-if="!text" class="docs-empty">{{ current.empty }}</p>
      <!-- eslint-disable-next-line vue/no-v-html — renderMarkdown escapt sämtliches HTML zuerst -->
      <div v-else class="md" v-html="html"></div>
    </div>
  </div>
</template>

<style scoped>
.docs-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
}
.docs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.docs-tabs {
  display: flex;
  gap: 6px;
}
.docs-tab {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.docs-tab:hover {
  border-color: var(--border);
  color: var(--text);
}
.docs-tab.active {
  background: var(--panel-2);
  border-color: var(--border);
  color: var(--text);
}
.docs-close {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.docs-body {
  flex: 1;
  overflow: auto;
  padding: 14px 18px;
  font-size: 13px;
  line-height: 1.55;
}
.docs-empty {
  color: var(--muted);
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4) {
  margin: 16px 0 6px;
  font-size: 14px;
}
.md :deep(h1) {
  font-size: 16px;
  margin-top: 0;
}
.md :deep(p),
.md :deep(ul),
.md :deep(ol) {
  margin: 0 0 10px;
}
.md :deep(ul),
.md :deep(ol) {
  padding-left: 20px;
}
.md :deep(code) {
  background: var(--panel-2);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 12px;
}
.md :deep(pre) {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  overflow: auto;
}
.md :deep(pre code) {
  background: transparent;
  padding: 0;
}
</style>
