<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import HistoryList from '@/components/HistoryList.vue';

const store = useAppStore();
const router = useRouter();

function onSelect(id: string): void {
  store.revertTo(id);
  void router.push('/');
}
</script>

<template>
  <div class="versions">
    <div class="head">
      <h2>Versionen</h2>
      <RouterLink to="/" class="back">← Zurück</RouterLink>
    </div>
    <HistoryList :entries="store.history" :active-id="store.activeId" @select="onSelect" />
  </div>
</template>

<style scoped>
.versions {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
h2 {
  margin: 0;
  font-size: 16px;
}
.back {
  color: var(--text);
  text-decoration: none;
  border: 1px solid var(--border);
  padding: 6px 12px;
  border-radius: 9px;
  font-size: 13px;
}
.back:hover {
  border-color: var(--accent);
}
</style>
