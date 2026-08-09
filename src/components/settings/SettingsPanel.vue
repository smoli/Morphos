<script setup lang="ts">
/**
 * Die Einstellungen als Ansicht der Schale: links die Kategorien, rechts der
 * gewählte Bereich. Sie liegen in einem gewöhnlichen Fenster (SystemWindow) —
 * darum trägt diese Komponente keinen Rahmen, keine Überschrift und kein Kreuz;
 * das alles gehört dem Fenster.
 *
 * Die Bereiche selbst kennt das Panel nicht — es rendert, was in
 * `settings/sections.ts` registriert ist (siehe dort für neue Kategorien).
 */
import { computed, ref, watch } from 'vue';
import { SETTINGS_SECTIONS, type SettingsSection } from './sections';

const props = withDefaults(defineProps<{ sections?: readonly SettingsSection[] }>(), {
  sections: () => SETTINGS_SECTIONS,
});

const activeId = ref(props.sections[0]?.id ?? '');
const active = computed<SettingsSection | undefined>(
  () => props.sections.find((s) => s.id === activeId.value) ?? props.sections[0],
);

// Fällt der offene Bereich weg (andere Registrierung), auf den ersten zurück.
watch(
  () => props.sections,
  (sections) => {
    if (!sections.some((s) => s.id === activeId.value)) activeId.value = sections[0]?.id ?? '';
  },
);
</script>

<template>
  <div class="settings-panel">
    <nav class="side" role="tablist" aria-label="Kategorien">
      <button
        v-for="section in props.sections"
        :key="section.id"
        type="button"
        class="cat"
        role="tab"
        :class="{ active: section.id === active?.id }"
        :aria-selected="section.id === active?.id"
        @click="activeId = section.id"
      >
        <span class="cat-icon" aria-hidden="true">{{ section.icon }}</span>
        <span class="cat-label">{{ section.label }}</span>
      </button>
    </nav>

    <div class="pane" role="tabpanel" :aria-label="active?.label">
      <component :is="active.component" v-if="active" :key="active.id" />
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  height: 100%;
  display: grid;
  grid-template-columns: 184px 1fr;
  min-height: 0;
  background: var(--panel);
}
.side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  border-right: 1px solid var(--border);
  background: var(--panel-2);
  overflow-y: auto;
}
.cat {
  display: flex;
  align-items: center;
  gap: 9px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  border-radius: 9px;
  padding: 7px 10px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.cat:hover {
  border-color: var(--border);
  color: var(--text);
}
.cat.active {
  background: var(--panel);
  border-color: var(--border);
  color: var(--text);
}
.cat-icon {
  font-size: 14px;
}
.cat-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pane {
  overflow-y: auto;
  padding: 18px;
  min-width: 0;
}
</style>
