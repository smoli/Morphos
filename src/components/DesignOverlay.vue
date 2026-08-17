<script setup lang="ts">
import DesignBlock from './DesignBlock.vue';
import type { Block } from '@/core/design';

/**
 * Der Entwurfs-Modus des UI-Designers (e15): eine durchscheinende Schicht über
 * der laufenden App, auf der die Kästen des Entwurfs liegen — jeder an seinem
 * Anteil des Fensters (core/design), jeder mit seinem Namen, geschachtelte in
 * ihrem Elter. Die App darunter läuft weiter und bleibt zu sehen; nur anfassen
 * lässt sie sich nicht, solange die Schicht liegt.
 *
 * Hier wird ausschließlich gezeigt (c0105). Zeichnen, Verschieben, Benennen und
 * das Schreiben der Datei kommen ab c0107 — dann wird aus dieser Fläche die
 * Zeichenfläche.
 */
defineProps<{ blocks: Block[] }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <div class="design-overlay">
    <div class="design-head">
      <span class="design-title">Entwurf</span>
      <span class="design-hint">Die Kästen, an die sich der Agent hält</span>
      <button type="button" class="design-close" @click="$emit('close')">Schließen</button>
    </div>

    <div class="design-stage">
      <p v-if="!blocks.length" class="design-empty">
        Für diese App gibt es noch keinen Entwurf.
      </p>
      <DesignBlock v-for="block in blocks" :key="block.id" :block="block" />
    </div>
  </div>
</template>

<style scoped>
/*
 * Die Schicht deckt das Fenster ab, ohne es zu verdecken: Der Untergrund bleibt
 * durchscheinend, damit der Entwurf über der App liegt, auf die er sich
 * bezieht. Sie liegt unter dem Chat (6) und der Fehlermeldung (5) — was
 * mitzuteilen ist, gehört nach vorn.
 */
.design-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  background: rgba(15, 17, 21, 0.35);
}
.design-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: rgba(15, 17, 21, 0.85);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.design-title {
  font-weight: 600;
}
.design-hint {
  flex: 1;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.design-close {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.design-close:hover {
  border-color: var(--accent);
}
/* Die Fläche, auf der die Anteile des Entwurfs gelten: der Rest des Fensters. */
.design-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
}
.design-empty {
  margin: 0;
  padding: 14px 16px;
  color: var(--muted);
  font-size: 13px;
}
</style>
