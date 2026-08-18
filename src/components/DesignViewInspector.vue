<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  MAX_VIEW_DESCRIPTION_LENGTH,
  MAX_VIEW_TITLE_LENGTH,
  type View,
} from '@/core/design';

/**
 * Das Feld zur gezeigten Ansicht (c0113): ihr Titel und ihre Beschreibung —
 * beides geht wörtlich in den Prompt (core/prompt: formatDesign), der Titel als
 * Überschrift ihres Abschnitts.
 *
 * Es ist das Gegenstück zum Feld des ausgewählten Kastens (DesignInspector) und
 * arbeitet wie dieses: Ein fertiger Text geht als `update` nach oben, das
 * Fenster schickt ihn durch den Store auf die Platte, und was von dort
 * zurückkommt, füllt die Felder erneut. Fertig ist ein Text mit dem Verlassen
 * des Feldes (`change`), nicht mit jedem Tastendruck; Escape verwirft und
 * schließt.
 *
 * Es sitzt in der unteren LINKEN Ecke, damit es neben dem Feld des Kastens
 * bestehen kann: Ansicht und Kasten sind zwei Ebenen, und man beschreibt gern
 * beide nacheinander.
 *
 * Ein leerer Titel geht nicht nach oben — eine Ansicht ohne Titel gibt es nicht
 * (core/design: updateView). Das Löschen steht wie beim Kasten unten und für
 * sich; anders als dort nimmt es aber die Kästen mit, darum sagt es das auch.
 */
const props = defineProps<{ view: View }>();

const emit = defineEmits<{
  /** Titel bzw. Beschreibung dieser Ansicht sind fortan andere. */
  update: [patch: { title?: string; description?: string }];
  /** Diese Ansicht soll weg — samt ihren Kästen. */
  delete: [];
  close: [];
}>();

const title = ref('');
const description = ref('');

/** Was im Feld steht, kommt aus der Ansicht — auch nach dem Speichern. */
watch(
  () => props.view,
  (v) => {
    title.value = v.title;
    description.value = v.description ?? '';
  },
  { immediate: true },
);

/** Ein Text ist fertig: Nur eine echte Änderung geht nach oben. */
function commitTitle(): void {
  const next = title.value.trim();
  // Ein leerer Titel ist keine Ansage, sondern ein Versehen: Das Feld holt sich
  // den alten zurück, statt ihn wegzuwerfen.
  if (!next) {
    title.value = props.view.title;
    return;
  }
  if (next === props.view.title) return;
  emit('update', { title: next });
}

function commitDescription(): void {
  const next = description.value.trim();
  if (next === (props.view.description ?? '')) return;
  emit('update', { description: next });
}

/** Escape: Das Feld sagt nichts und geht zu — die Ansicht bleibt, wie sie war. */
function cancel(): void {
  title.value = props.view.title;
  description.value = props.view.description ?? '';
  emit('close');
}
</script>

<template>
  <!-- Ein Zug in diesem Feld ist kein Zeichenzug (wie beim DesignInspector). -->
  <div class="design-view-inspector" @pointerdown.stop @click.stop>
    <div class="dvi-head">
      <span class="dvi-what">Ansicht</span>
      <button type="button" class="dvi-close" title="Schließen" @click="emit('close')">✕</button>
    </div>

    <label class="dvi-field">
      <span class="dvi-label">Titel</span>
      <input
        class="dvi-title"
        type="text"
        :maxlength="MAX_VIEW_TITLE_LENGTH"
        placeholder="z. B. Liste"
        v-model="title"
        @change="commitTitle"
        @keydown.esc.prevent.stop="cancel"
      />
    </label>

    <label class="dvi-field">
      <span class="dvi-label">Beschreibung</span>
      <textarea
        class="dvi-description"
        rows="4"
        :maxlength="MAX_VIEW_DESCRIPTION_LENGTH"
        placeholder="Wofür diese Ansicht da ist — der Agent hält sich daran."
        v-model="description"
        @change="commitDescription"
        @keydown.esc.prevent.stop="cancel"
      ></textarea>
    </label>

    <div class="dvi-foot">
      <button
        type="button"
        class="dvi-delete"
        title="Diese Ansicht löschen — ihre Kästen gehen mit"
        @click="emit('delete')"
      >
        Ansicht löschen
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * Die linke untere Ecke — gegenüber dem Feld des Kastens (DesignInspector), das
 * rechts sitzt. Über der Chat-Leiste steht es wie jenes (i0008):
 * `--composer-height` schreibt der Rahmen an.
 */
.design-view-inspector {
  position: absolute;
  left: 12px;
  bottom: calc(12px + var(--composer-height, 0px));
  max-height: calc(100% - var(--composer-height, 0px) - 24px);
  overflow-y: auto;
  z-index: 1;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: rgba(15, 17, 21, 0.94);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  cursor: default;
  user-select: text;
}
.dvi-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dvi-what {
  flex: 1;
  color: var(--muted);
}
.dvi-close {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
}
.dvi-close:hover {
  color: var(--text);
}
.dvi-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dvi-label {
  color: var(--muted);
}
.dvi-title,
.dvi-description {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--text);
  font: inherit;
}
.dvi-description {
  resize: vertical;
  min-height: 48px;
}
.dvi-title:focus,
.dvi-description:focus {
  outline: none;
  border-color: var(--accent, rgba(108, 140, 255, 0.85));
}
.dvi-foot {
  display: flex;
  justify-content: flex-end;
}
.dvi-delete {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}
.dvi-delete:hover {
  border-color: var(--danger, #ff6c6c);
  color: var(--danger, #ff6c6c);
}
</style>
