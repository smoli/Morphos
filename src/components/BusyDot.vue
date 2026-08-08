<script setup lang="ts">
/**
 * Arbeitsanzeige einer App: ein kleiner laufender Ring. Er sitzt überall dort,
 * wo eine App auftaucht, während ein Agent für sie arbeitet oder wartet —
 * Kachel, Dock und Fenstertitel.
 */
withDefaults(defineProps<{ title?: string }>(), { title: 'Ein Agent arbeitet an dieser App' });
</script>

<template>
  <span class="busy-dot" role="img" :aria-label="title" :title="title"></span>
</template>

<style scoped>
.busy-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: busy-spin 0.9s linear infinite;
}
@keyframes busy-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
