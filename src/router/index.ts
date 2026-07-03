import { createRouter, createWebHashHistory } from 'vue-router';
import StartView from '@/views/StartView.vue';
import DesktopView from '@/views/DesktopView.vue';
import { useWorkspaceStore } from '@/stores/workspace';

// Hash-History, damit die Navigation auch unter file:// in Electron funktioniert.
// Apps werden als Fenster auf dem Desktop geöffnet (kein eigener Router-Pfad).
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'start', component: StartView },
    { path: '/desktop', name: 'desktop', component: DesktopView },
    // Alt-Links auf einzelne Apps landen auf dem Desktop.
    { path: '/app/:id', redirect: '/desktop' },
    { path: '/app/:id/versions', redirect: '/desktop' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

// Ohne gewähltes Verzeichnis zurück zum Startbildschirm.
router.beforeEach((to) => {
  if (to.name === 'start') return true;
  const workspace = useWorkspaceStore();
  if (!workspace.hasFolder) return { name: 'start' };
  return true;
});
