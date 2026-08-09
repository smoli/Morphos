<script setup lang="ts">
import TopBar from '@/components/TopBar.vue';
import PermissionDialog from '@/components/PermissionDialog.vue';
import ToastStack from '@/components/ToastStack.vue';
import { useDesktopStore } from '@/stores/desktop';
import { SETTINGS_ID } from '@/core/system';

// Die Einstellungen sind kein Dialog über allem, sondern ein gewöhnliches
// Fenster des Desktops (siehe core/system) — die Kopfleiste öffnet es genauso
// wie das Tastenkürzel des Desktops.
const desktop = useDesktopStore();
</script>

<template>
  <div class="app">
    <TopBar @open-settings="desktop.openSystem(SETTINGS_ID)" />
    <main class="main">
      <RouterView />
    </main>
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
