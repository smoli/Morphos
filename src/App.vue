<script setup lang="ts">
import TopBar from '@/components/TopBar.vue';
import PermissionDialog from '@/components/PermissionDialog.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import ToastStack from '@/components/ToastStack.vue';
import { useShellStore } from '@/stores/shell';

// Die Einstellungen öffnet nicht nur die Kopfleiste, sondern auch das
// Tastenkürzel des Desktops — der Zustand liegt darum in der Schale.
const shell = useShellStore();
</script>

<template>
  <div class="app">
    <TopBar @open-settings="shell.openSettings()" />
    <main class="main">
      <RouterView />
    </main>
    <SettingsDialog v-if="shell.settingsOpen" @close="shell.closeSettings()" />
    <PermissionDialog />
    <!-- Einmal für die ganze Schale: Meldungen gehören keinem Fenster. -->
    <ToastStack />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100vh;
}
.main {
  overflow: hidden;
}
</style>
