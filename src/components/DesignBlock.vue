<script setup lang="ts">
import { computed } from 'vue';
import type { Block, Rect } from '@/core/design';

/**
 * Ein Kasten des UI-Entwurfs (e15) — samt seiner Kinder, die er wiederum als
 * DesignBlock zeichnet (die Komponente ruft sich selbst auf). Ein Kasten trägt
 * seinen Namen und, wenn er eine hat, seine Rolle; mehr gibt es hier nicht zu
 * tun: Gezeichnet, verschoben und benannt wird erst ab c0107.
 *
 * Die Geometrie des Entwurfs sind Anteile des APP-FENSTERS (c0104) — auch die
 * eines Kindes. Gezeichnet wird ein Kind aber im Kasten seines Elters, darum
 * rechnet `style` die Anteile einmal auf dessen Kasten um. Das Verschachteln
 * bleibt so eine reine Aussage über die Gliederung, ist im Baum aber zu sehen.
 */
const props = defineProps<{ block: Block; parent?: Rect }>();

/** Ein Anteil als Prozentzahl fürs Stylesheet — ohne den Staub des Fließkommas. */
function percent(share: number): string {
  return `${+(share * 100).toFixed(2)}%`;
}

const style = computed(() => {
  const r = props.block.rect;
  const p = props.parent;
  if (!p) {
    return { left: percent(r.x), top: percent(r.y), width: percent(r.w), height: percent(r.h) };
  }
  // Ein Elter ohne Ausdehnung gäbe es im Entwurf nicht (MIN_BLOCK_SIZE) — die
  // Null hier abzufangen kostet nichts und rettet vor einer Division durchs Nichts.
  const pw = p.w || 1;
  const ph = p.h || 1;
  return {
    left: percent((r.x - p.x) / pw),
    top: percent((r.y - p.y) / ph),
    width: percent(r.w / pw),
    height: percent(r.h / ph),
  };
});
</script>

<template>
  <div class="design-block" :style="style">
    <span class="db-label">
      <span class="db-name">{{ block.name }}</span>
      <span v-if="block.type" class="db-type">{{ block.type }}</span>
    </span>
    <DesignBlock v-for="child in block.children" :key="child.id" :block="child" :parent="block.rect" />
  </div>
</template>

<style scoped>
/*
 * Ein Kasten liegt an seinem Platz im Elter (bzw. auf der Fläche). Er bleibt
 * durchscheinend: Darunter läuft die App weiter, und sie soll zu sehen bleiben.
 */
.design-block {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid rgba(108, 140, 255, 0.85);
  border-radius: 8px;
  background: rgba(108, 140, 255, 0.1);
}
/* Die Beschriftung sitzt in der oberen linken Ecke — sie darf den Kasten nicht
   sprengen, auch wenn der Name lang ist. */
.db-label {
  position: absolute;
  top: 3px;
  left: 5px;
  right: 5px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}
.db-name {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.db-type {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 10px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
</style>
