import { createRouter, createWebHashHistory } from 'vue-router';
import StartView from '@/views/StartView.vue';
import DesktopView from '@/views/DesktopView.vue';
import WorkspaceView from '@/views/WorkspaceView.vue';
import VersionsView from '@/views/VersionsView.vue';
import { useWorkspaceStore } from '@/stores/workspace';

// Hash-History, damit die Navigation auch unter file:// in Electron funktioniert.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'start', component: StartView },
    { path: '/desktop', name: 'desktop', component: DesktopView },
    { path: '/app/new', name: 'app-new', component: WorkspaceView },
    { path: '/app/:id', name: 'app', component: WorkspaceView, props: true },
    { path: '/app/:id/versions', name: 'versions', component: VersionsView, props: true },
  ],
});

// Ohne gewähltes Verzeichnis zurück zum Startbildschirm.
router.beforeEach((to) => {
  if (to.name === 'start') return true;
  const workspace = useWorkspaceStore();
  if (!workspace.hasFolder) return { name: 'start' };
  return true;
});
