<script setup lang="ts">
import { computed } from 'vue';
import { isImageIcon } from '@/core/icon';
import { DEFAULT_ICON } from '@/core/app';

/**
 * Zeigt das Icon einer App — überall gleich: als Emoji oder, wenn der Anwender
 * ein Bild gewählt hat, als Bild. Jede Stelle, die ein App-Icon darstellt
 * (Kachel, Titelleiste, Dock, Chat-Kontext), nutzt diese Komponente.
 */
const props = withDefaults(defineProps<{ icon?: string | null; size?: number }>(), { size: 16 });

const isImage = computed(() => isImageIcon(props.icon ?? ''));
const emoji = computed(() => (props.icon ?? '').trim() || DEFAULT_ICON);
const px = computed(() => `${props.size}px`);
</script>

<template>
  <img v-if="isImage" class="app-icon image" :src="icon ?? ''" alt="" :style="{ width: px, height: px }" />
  <span v-else class="app-icon emoji" :style="{ fontSize: px, lineHeight: 1 }">{{ emoji }}</span>
</template>

<style scoped>
.app-icon {
  flex-shrink: 0;
}
.image {
  /* Nicht verzerren und nicht überstrahlen: Das Bild sitzt im Quadrat. */
  object-fit: contain;
  border-radius: 20%;
  display: block;
}
</style>
