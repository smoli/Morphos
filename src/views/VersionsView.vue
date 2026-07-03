<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';
import HistoryList from '@/components/HistoryList.vue';

const store = useAppStore();
const workspace = useWorkspaceStore();
const route = useRoute();
const router = useRouter();

const id = route.params.id as string;

onMounted(async () => {
  // Bei Direktaufruf/Reload sicherstellen, dass die App geladen ist.
  if (workspace.folder && store.id !== id) {
    await store.open(workspace.folder, id);
  } else if (store.versions.length === 0) {
    await store.loadVersions();
  }
});

async function onSelect(sha: string): Promise<void> {
  await store.revertTo(sha);
  void router.push(`/app/${id}`);
}
</script>

<template>
  <div class="versions">
    <div class="head">
      <h2>
        <span class="app-icon">{{ store.icon }}</span>
        {{ store.name }} — Versionen
      </h2>
      <RouterLink :to="`/app/${id}`" class="back">← Zurück</RouterLink>
    </div>
    <HistoryList :versions="store.versions" :active-sha="store.activeSha" @select="onSelect" />
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
  display: flex;
  align-items: center;
  gap: 8px;
}
.app-icon {
  font-size: 20px;
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
