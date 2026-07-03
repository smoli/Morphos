<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkspaceStore } from '@/stores/workspace';

const workspace = useWorkspaceStore();
const router = useRouter();

onMounted(() => {
  void workspace.init();
});

function folderName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

async function openRecent(path: string): Promise<void> {
  await workspace.openFolder(path);
  void router.push('/desktop');
}

async function openNew(): Promise<void> {
  const ok = await workspace.chooseFolder();
  if (ok) void router.push('/desktop');
}
</script>

<template>
  <section class="start">
    <div class="hero">
      <span class="logo">◈</span>
      <h1>Morphos</h1>
      <p class="lead">
        Wähle ein Verzeichnis, in dem deine Apps liegen. Jede App wird dort als
        eigener Ordner gespeichert und bleibt erhalten.
      </p>
    </div>

    <div class="panel">
      <h2>Zuletzt geöffnet</h2>
      <ul v-if="workspace.recentFolders.length" class="recent">
        <li v-for="path in workspace.recentFolders" :key="path">
          <button type="button" class="folder" @click="openRecent(path)">
            <span class="folder-icon">📁</span>
            <span class="folder-text">
              <span class="folder-name">{{ folderName(path) }}</span>
              <span class="folder-path">{{ path }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="empty">Noch keine Verzeichnisse verwendet.</p>

      <button type="button" class="open" @click="openNew">📂 Ordner öffnen …</button>

      <p v-if="workspace.error" class="error">{{ workspace.error }}</p>
    </div>
  </section>
</template>

<style scoped>
.start {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 32px;
}
.hero {
  text-align: center;
  max-width: 540px;
}
.logo {
  font-size: 44px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
h1 {
  margin: 8px 0 6px;
  font-size: 30px;
}
.lead {
  color: var(--muted);
  line-height: 1.55;
  margin: 0;
}
.panel {
  width: 100%;
  max-width: 520px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
}
h2 {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--muted);
  font-weight: 600;
}
.recent {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.folder {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 11px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.folder:hover {
  border-color: var(--accent);
}
.folder-icon {
  font-size: 20px;
}
.folder-text {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.folder-name {
  font-size: 14px;
  font-weight: 600;
}
.folder-path {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  color: var(--muted);
  margin: 0 0 16px;
  font-size: 13px;
}
.open {
  width: 100%;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  border: 0;
  padding: 13px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.error {
  color: #ffb3b3;
  font-size: 13px;
  margin: 12px 0 0;
}
</style>
