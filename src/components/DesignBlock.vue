<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Block, Rect } from '@/core/design';

/**
 * Ein Kasten des UI-Entwurfs (e15) — samt seiner Kinder, die er wiederum als
 * DesignBlock zeichnet (die Komponente ruft sich selbst auf). Ein Kasten trägt
 * seinen Namen und, wenn er eine hat, seine Rolle.
 *
 * Sein Name lässt sich an Ort und Stelle ändern (c0107): Ein Klick darauf macht
 * aus der Beschriftung ein Feld. Welcher Kasten gerade bearbeitet wird, weiß
 * nicht der Kasten selbst, sondern die Fläche — sie reicht `editingId` durch den
 * ganzen Baum, damit immer nur EIN Feld offen ist. Geschrieben wird hier nichts:
 * Der fertige Name geht als Ereignis nach oben.
 *
 * Die Geometrie des Entwurfs sind Anteile des APP-FENSTERS (c0104) — auch die
 * eines Kindes. Gezeichnet wird ein Kind aber im Kasten seines Elters, darum
 * rechnet `style` die Anteile einmal auf dessen Kasten um. Das Verschachteln
 * bleibt so eine reine Aussage über die Gliederung, ist im Baum aber zu sehen.
 */
const props = defineProps<{ block: Block; parent?: Rect; editingId?: string | null }>();

const emit = defineEmits<{
  /** Dieser Kasten möchte umbenannt werden (Klick auf den Namen). */
  edit: [id: string];
  /** Der Name steht fest (Eingabetaste oder Verlassen des Feldes). */
  commit: [id: string, name: string];
  /**
   * Abbruch (Escape) — der Name bleibt, wie er war. Escape kommt dabei nicht
   * weiter nach oben: Ein Druck räumt EINE Sache ab (DesktopView), und das ist
   * hier das offene Feld, nicht der ganze Entwurfs-Modus.
   */
  cancel: [];
}>();

const editing = computed(() => !!props.editingId && props.editingId === props.block.id);

const input = ref<HTMLInputElement | null>(null);

/**
 * Ein offenes Feld endet genau EINMAL: Eingabetaste und das anschließende
 * Verlassen des Feldes sind zwei Ereignisse, aber ein Vorgang.
 */
let settled = false;

watch(editing, async (on) => {
  if (!on) return;
  settled = false;
  await nextTick();
  // Der Name steht ausgewählt da: Wer tippt, ersetzt den Platzhalter, wer nur
  // Enter drückt, behält ihn.
  input.value?.focus();
  input.value?.select();
}, { immediate: true });

function commit(): void {
  if (settled) return;
  settled = true;
  emit('commit', props.block.id, input.value?.value ?? props.block.name);
}

function cancel(): void {
  if (settled) return;
  settled = true;
  emit('cancel');
}

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
  <div class="design-block" :class="{ editing }" :style="style">
    <span class="db-label">
      <input
        v-if="editing"
        ref="input"
        class="db-input"
        type="text"
        :value="block.name"
        @pointerdown.stop
        @keydown.enter.prevent.stop="commit"
        @keydown.esc.prevent.stop="cancel"
        @blur="commit"
      />
      <span v-else class="db-name" @pointerdown.stop @click.stop="emit('edit', block.id)">{{ block.name }}</span>
      <span v-if="block.type" class="db-type">{{ block.type }}</span>
    </span>
    <DesignBlock
      v-for="child in block.children"
      :key="child.id"
      :block="child"
      :parent="block.rect"
      :editing-id="editingId"
      @edit="emit('edit', $event)"
      @commit="(id, name) => emit('commit', id, name)"
      @cancel="emit('cancel')"
    />
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
  cursor: text;
}
/* Der gerade bearbeitete Kasten tritt hervor — man soll sehen, wovon man redet. */
.design-block.editing {
  border-color: var(--accent, rgba(108, 140, 255, 1));
  background: rgba(108, 140, 255, 0.18);
}
/* Das Feld sitzt an der Stelle der Beschriftung und sieht aus wie sie. */
.db-input {
  flex: 1;
  min-width: 0;
  padding: 0 3px;
  background: rgba(15, 17, 21, 0.9);
  border: 1px solid var(--accent, rgba(108, 140, 255, 0.85));
  border-radius: 4px;
  color: var(--text);
  font: inherit;
  font-weight: 600;
}
.db-type {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 10px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
</style>
