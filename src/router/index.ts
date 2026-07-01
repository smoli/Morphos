import { createRouter, createWebHashHistory } from 'vue-router';
import WorkspaceView from '@/views/WorkspaceView.vue';
import VersionsView from '@/views/VersionsView.vue';

// Hash-History, damit die Navigation auch unter file:// in Electron funktioniert.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'workspace', component: WorkspaceView },
    { path: '/versions', name: 'versions', component: VersionsView },
  ],
});
