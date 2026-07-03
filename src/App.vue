<script setup lang="ts">
import TopBar from '@/components/TopBar.vue';
import PermissionDialog from '@/components/PermissionDialog.vue';
</script>

<template>
  <div class="app">
    <TopBar />
    <main class="main">
      <RouterView />
    </main>
    <PermissionDialog />
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
