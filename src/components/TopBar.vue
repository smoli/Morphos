<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useWorkspaceStore } from '@/stores/workspace';

const route = useRoute();
const workspace = useWorkspaceStore();

const onDesktop = computed(() => route.name === 'desktop');
const brandTarget = computed(() => (workspace.hasFolder ? '/desktop' : '/'));

function folderName(p: string | null): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}
</script>

<template>
  <header class="topbar">
    <RouterLink :to="brandTarget" class="brand">
      <span class="logo">◈</span>
      <span>
        <span class="brand-name">Morphos</span>
        <span class="brand-sub">Die App, die sich selbst entwickelt</span>
      </span>
    </RouterLink>

    <div class="right">
      <template v-if="onDesktop">
        <span class="current" :title="workspace.folder ?? ''">📁 {{ folderName(workspace.folder) }}</span>
        <RouterLink to="/" class="link">Ordner wechseln</RouterLink>
      </template>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text);
}
.logo {
  font-size: 22px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-name {
  display: block;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.3px;
}
.brand-sub {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.current {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current-icon {
  font-size: 16px;
}
.link {
  color: var(--text);
  text-decoration: none;
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 13px;
}
.link:hover {
  border-color: var(--accent);
}
</style>
