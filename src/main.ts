import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useWorkspaceStore } from './stores/workspace';
import { blockStrayDrops } from './core/drop';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// Eine Datei, die neben ihr Ziel fällt, darf die Schale nicht ersetzen.
blockStrayDrops(window);

// Zuletzt genutzte Ordner laden, sobald die Brücke (window.morphos) bereitsteht.
void useWorkspaceStore().init();
