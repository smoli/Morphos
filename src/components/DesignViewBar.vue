<script setup lang="ts">
import { MAX_VIEWS, type View } from '@/core/design';

/**
 * Die Reiterleiste der Ansichten (c0113): Ein Entwurf hat einen Bildschirm oder
 * viele — Liste und Detail, Anmeldung und Arbeitsfläche —, und die Leiste sagt,
 * welche davon gerade auf der Fläche liegt.
 *
 * Sie zeigt nur und bittet: Ein Klick meldet `select`, das ＋ meldet `add`, ein
 * Klick auf die schon gezeigte Ansicht meldet `edit` (dort bekommt sie Titel und
 * Beschreibung). Angelegt und umbenannt wird nichts hier — das tut das Fenster
 * über den Store, und maßgeblich bleibt die Datei.
 *
 * Ohne Ansicht bleibt die Leiste still: Ein Entwurf, in den noch niemand etwas
 * gezeichnet hat, soll nicht erst nach einer Ansicht verlangen — der erste
 * Kasten legt sie an (stores/app: addDesignBlock).
 */
defineProps<{
  views: View[];
  /** Welche Ansicht auf der Fläche liegt; null, solange es keine gibt. */
  viewId: string | null;
}>();

const emit = defineEmits<{
  /** Fortan soll jene Ansicht zu sehen sein. */
  select: [id: string];
  /** Eine weitere Ansicht, bitte. */
  add: [];
  /** Die gezeigte Ansicht möchte beschrieben werden. */
  edit: [];
}>();

/** Ein Klick auf den schon offenen Reiter beschreibt ihn, statt nichts zu tun. */
function onTab(id: string, active: boolean): void {
  if (active) emit('edit');
  else emit('select', id);
}
</script>

<template>
  <!-- Die Leiste gehört zur Kopfzeile und nicht zur Fläche: Ein Klick hier
       zeichnet nicht. -->
  <div v-if="views.length" class="design-views" @pointerdown.stop @click.stop>
    <button
      v-for="view in views"
      :key="view.id"
      type="button"
      class="dv-tab"
      :class="{ on: view.id === viewId }"
      :title="view.id === viewId ? 'Diese Ansicht beschreiben' : `Zu „${view.title}“ wechseln`"
      @click="onTab(view.id, view.id === viewId)"
    >
      {{ view.title }}
      <!-- Eine beschriebene Ansicht gibt sich zu erkennen: Was sie zu sagen hat,
           steht sonst hinter einem Klick. -->
      <span v-if="view.description" class="dv-said" aria-hidden="true">·</span>
    </button>
    <button
      v-if="views.length < MAX_VIEWS"
      type="button"
      class="dv-add"
      title="Eine weitere Ansicht anlegen"
      @click="emit('add')"
    >
      ＋
    </button>
  </div>
</template>

<style scoped>
.design-views {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px 10px 6px;
  background: rgba(15, 17, 21, 0.85);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
/* Ein Reiter sieht aus wie ein Reiter: Der gezeigte steht vorn, die anderen
   treten zurück. */
.dv-tab {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 3px 10px;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}
.dv-tab:hover {
  color: var(--text);
}
.dv-tab.on {
  background: var(--panel-2);
  border-color: var(--accent, rgba(108, 140, 255, 0.85));
  color: var(--text);
}
.dv-said {
  margin-left: 4px;
  color: var(--accent, rgba(108, 140, 255, 0.85));
}
.dv-add {
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px 8px;
  color: var(--muted);
  font: inherit;
  line-height: 1.2;
  cursor: pointer;
}
.dv-add:hover {
  border-color: var(--accent);
  color: var(--text);
}
</style>
