<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import TopBar from '@/components/TopBar.vue';

const store = useAppStore();
</script>

<template>
  <div class="app">
    <TopBar :history-count="store.historyCount" />
    <main class="main">
      <RouterView />
    </main>
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
