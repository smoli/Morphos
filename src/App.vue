<script setup lang="ts">
import { ref } from 'vue';
import TopBar from '@/components/TopBar.vue';
import PermissionDialog from '@/components/PermissionDialog.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import ToastStack from '@/components/ToastStack.vue';

const showSettings = ref(false);
</script>

<template>
  <div class="app">
    <TopBar @open-settings="showSettings = true" />
    <main class="main">
      <RouterView />
    </main>
    <SettingsDialog v-if="showSettings" @close="showSettings = false" />
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
