import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAppStore } from './stores/app';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// Gespeicherten Zustand laden, sobald die Brücke (window.morphos) bereitsteht.
void useAppStore().loadFromHost();
