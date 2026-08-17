<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  BLOCK_ROLES,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_TYPE_LENGTH,
  type Block,
} from '@/core/design';

/**
 * Das kleine Feld zum ausgewählten Kasten (c0108): seine Rolle und seine
 * Anweisungen — beides freiwillig, beides geht wörtlich in den Prompt
 * (core/prompt: formatDesign). Der Name bleibt beim Kasten selbst
 * (DesignBlock), hier steht er nur, damit man weiß, wovon die Rede ist.
 *
 * Geschrieben wird auch hier nichts: Ein fertiger Text geht als `update` nach
 * oben, das Fenster schickt ihn durch den Store auf die Platte, und was von
 * dort zurückkommt, füllt die Felder erneut — maßgeblich ist die Datei.
 *
 * Fertig ist ein Text mit dem Verlassen des Feldes (`change`), nicht mit jedem
 * Tastendruck: Sonst schriebe jeder Buchstabe die Datei neu. Hat sich nichts
 * geändert, geht auch nichts nach oben. Escape verwirft das Feld und schließt
 * es — und bleibt hier, statt gleich den ganzen Entwurfs-Modus zuzuklappen.
 *
 * Seit c0110 steht hier auch das Löschen: Das Feld redet von EINEM Kasten, also
 * gehört das Wegwerfen dieses Kastens hierher und nicht in die Fläche. Gelöscht
 * wird dabei nur der Rahmen — seine Kinder rücken an seine Stelle (core/design:
 * deleteBlock). Darum wird auch nicht nachgefragt: Zu verlieren ist ein Kasten,
 * nicht ein halber Entwurf.
 *
 * Seit c0111 sagt das Feld auch, WO dieser Kasten steht: der Weg von der Wurzel
 * bis zu ihm (`ancestors`, gerechnet in core/design: pathIn) und die Kästen, die
 * er unmittelbar enthält. Beides ist zugleich der Weg dorthin — ein Klick bittet
 * um die Auswahl jenes Kastens (`select`). Auf der Fläche ist stets das Unterste
 * gemeint (c0110); einen Elter, den seine Kinder ganz ausfüllen, trifft man dort
 * gar nicht mehr, hier aber schon.
 */
const props = defineProps<{
  block: Block;
  /** Die Vorfahren des Kastens, von der Wurzel bis zu seinem Elter. */
  ancestors: Block[];
}>();

const emit = defineEmits<{
  /** Rolle bzw. Anweisungen dieses Kastens sind fortan andere. */
  update: [patch: { instructions?: string; type?: string }];
  /** Dieser Kasten soll weg (c0110) — seine Kinder rücken an seine Stelle. */
  delete: [];
  /** Fortan soll von jenem Kasten die Rede sein (c0111). */
  select: [id: string];
  close: [];
}>();

/**
 * Die Liste hängt über ihre Id am Feld. Sie ist je Kasten eigen, damit zwei
 * offene Felder einander nicht die Vorschläge wegnehmen (im Dokument muss eine
 * Id einmalig sein).
 */
const listId = `di-roles-${props.block.id}`;

const type = ref('');
const instructions = ref('');

/** Was im Feld steht, kommt aus dem Kasten — auch nach dem Speichern. */
watch(
  () => props.block,
  (b) => {
    type.value = b.type ?? '';
    instructions.value = b.instructions ?? '';
  },
  { immediate: true },
);

/** Ein Text ist fertig: Nur eine echte Änderung geht nach oben. */
function commit(field: 'type' | 'instructions', value: string): void {
  const next = value.trim();
  if (next === (props.block[field] ?? '')) return;
  emit('update', { [field]: next });
}

/** Escape: Das Feld sagt nichts und geht zu — der Kasten bleibt, wie er war. */
function cancel(): void {
  type.value = props.block.type ?? '';
  instructions.value = props.block.instructions ?? '';
  emit('close');
}
</script>

<template>
  <!-- Ein Zug in diesem Feld ist kein Zeichenzug: Er darf die Fläche darunter
       nicht erreichen, sonst zöge jedes Anklicken einen Kasten auf. -->
  <div class="design-inspector" @pointerdown.stop @click.stop>
    <div class="di-head">
      <!-- Der Weg zu diesem Kasten: „Entwurf › Inhalt › Liste“. Die Vorfahren
           sind Knöpfe — über sie kommt man dorthin; der Kasten selbst ist
           keiner, denn bei ihm ist man schon. -->
      <nav class="di-path" aria-label="Gliederung">
        <span class="di-root">Entwurf</span>
        <template v-for="up in ancestors" :key="up.id">
          <span class="di-sep" aria-hidden="true">›</span>
          <button
            type="button"
            class="di-crumb"
            :title="`Zu „${up.name}“ wechseln`"
            @click="emit('select', up.id)"
          >
            {{ up.name }}
          </button>
        </template>
        <span class="di-sep" aria-hidden="true">›</span>
        <span class="di-name">{{ block.name }}</span>
      </nav>
      <button type="button" class="di-close" title="Schließen" @click="emit('close')">✕</button>
    </div>

    <!-- Und was er enthält — nur die unmittelbaren Kinder: Tiefer kommt man
         über sie, ein ganzer Baum im Feld wäre der Entwurf ein zweites Mal. -->
    <div v-if="block.children.length" class="di-kids">
      <span class="di-label">Enthält</span>
      <div class="di-kid-list">
        <button
          v-for="child in block.children"
          :key="child.id"
          type="button"
          class="di-kid"
          :title="`Zu „${child.name}“ wechseln`"
          @click="emit('select', child.id)"
        >
          {{ child.name }}
        </button>
      </div>
    </div>

    <label class="di-field">
      <span class="di-label">Rolle</span>
      <input
        class="di-type"
        type="text"
        :list="listId"
        :maxlength="MAX_TYPE_LENGTH"
        placeholder="z. B. Kopfzeile"
        v-model="type"
        @change="commit('type', type)"
        @keydown.esc.prevent.stop="cancel"
      />
      <datalist :id="listId">
        <option v-for="role in BLOCK_ROLES" :key="role" :value="role" />
      </datalist>
    </label>

    <label class="di-field">
      <span class="di-label">Anweisungen</span>
      <textarea
        class="di-instructions"
        rows="4"
        :maxlength="MAX_INSTRUCTIONS_LENGTH"
        placeholder="Was in diesem Kasten geschehen soll — der Agent hält sich daran."
        v-model="instructions"
        @change="commit('instructions', instructions)"
        @keydown.esc.prevent.stop="cancel"
      ></textarea>
    </label>

    <!-- Löschen steht unten und für sich: Es ist das einzige hier, was sich
         nicht mit dem nächsten Tastendruck zurücknehmen lässt. -->
    <div class="di-foot">
      <button
        type="button"
        class="di-delete"
        title="Diesen Kasten löschen — seine Kinder bleiben und rücken an seine Stelle"
        @click="emit('delete')"
      >
        Kasten löschen
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * Das Feld sitzt in der unteren rechten Ecke der Schicht — nicht am Kasten:
 * Ein Kasten kann winzig sein oder am Rand kleben, das Feld soll immer an
 * derselben Stelle stehen und den Entwurf nicht verdecken.
 */
.design-inspector {
  position: absolute;
  right: 12px;
  bottom: 12px;
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
  /* Die Fläche verbietet das Markieren (dort zieht man Kästen); in den Feldern
     hier will man Text aber anfassen können. */
  user-select: text;
}
.di-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
/* Der Weg darf umbrechen: Das Feld ist schmal, ein tief geschachtelter Kasten
   hat aber viele Vorfahren — abgeschnitten wäre die Gliederung wertlos. */
.di-path {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
}
.di-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.di-root,
.di-sep {
  color: var(--muted);
}
/* Vorfahren und Kinder sind Wege, keine Schalter: Sie sehen aus wie Text und
   geben sich erst unter dem Zeiger zu erkennen. */
.di-crumb,
.di-kid {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
  border: none;
  padding: 0;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}
.di-crumb:hover,
.di-kid:hover {
  color: var(--text);
  text-decoration: underline;
}
.di-kids {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.di-kid-list {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
}
.di-close {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
}
.di-close:hover {
  color: var(--text);
}
.di-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.di-label {
  color: var(--muted);
}
.di-type,
.di-instructions {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--text);
  font: inherit;
}
.di-instructions {
  resize: vertical;
  min-height: 48px;
}
.di-type:focus,
.di-instructions:focus {
  outline: none;
  border-color: var(--accent, rgba(108, 140, 255, 0.85));
}
.di-foot {
  display: flex;
  justify-content: flex-end;
}
/* Zurückhaltend, aber in der Farbe der Warnung: Es soll zu finden sein, ohne
   sich anzubieten. */
.di-delete {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}
.di-delete:hover {
  border-color: var(--danger, #ff6c6c);
  color: var(--danger, #ff6c6c);
}
</style>
