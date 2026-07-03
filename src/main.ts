import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useWorkspaceStore } from './stores/workspace';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// Zuletzt genutzte Ordner laden, sobald die Brücke (window.morphos) bereitsteht.
void useWorkspaceStore().init();
