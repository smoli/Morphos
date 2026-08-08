<script setup lang="ts">
import { computed, type Component } from 'vue';
import WindowFrame from './WindowFrame.vue';
import ExplorerPanel from './ExplorerPanel.vue';
import { EXPLORER_ID } from '@/core/system';
import type { DesktopWindow } from '@/stores/desktop';

/**
 * Ein Fenster, das keine erzeugte App zeigt, sondern eine Ansicht der Schale
 * selbst — derzeit der Datei-Explorer (siehe core/system). Es hat denselben
 * Rahmen wie ein App-Fenster (WindowFrame), aber keinen Instanz-Store und
 * keinen Agenten: Der Inhalt ist eine Komponente der Schale.
 */
const props = defineProps<{ win: DesktopWindow; single?: boolean }>();

/** Welche Komponente in welchem System-Fenster liegt. */
const BODIES: Record<string, Component> = {
  [EXPLORER_ID]: ExplorerPanel,
};

const body = computed<Component | null>(() =>
  props.win.systemId ? BODIES[props.win.systemId] ?? null : null,
);
</script>

<template>
  <WindowFrame :win="win" :single="single">
    <component :is="body" v-if="body" />
    <p v-else class="sys-unknown">Diese Ansicht gibt es nicht mehr.</p>
  </WindowFrame>
</template>

<style scoped>
.sys-unknown {
  margin: 0;
  padding: 24px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
</style>
