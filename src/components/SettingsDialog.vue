<script setup lang="ts">
/**
 * Einstellungen als Schale: links die Kategorien, rechts der gewählte Bereich.
 * Die Bereiche selbst kennt der Dialog nicht — er rendert, was in
 * `settings/sections.ts` registriert ist (siehe dort für neue Kategorien).
 */
import { computed, ref, watch } from 'vue';
import { SETTINGS_SECTIONS, type SettingsSection } from './settings/sections';

const props = withDefaults(defineProps<{ sections?: readonly SettingsSection[] }>(), {
  sections: () => SETTINGS_SECTIONS,
});
const emit = defineEmits<{ close: [] }>();

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
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Einstellungen">
      <header class="head">
        <h2>Einstellungen</h2>
        <button type="button" class="close" title="Schließen" @click="emit('close')">✕</button>
      </header>

      <div class="body">
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
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(6, 7, 10, 0.6);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  padding: 24px;
}
.dialog {
  width: min(760px, 100%);
  height: min(560px, 86vh);
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.head h2 {
  margin: 0;
  font-size: 16px;
}
.close {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 9px;
  padding: 5px 10px;
  cursor: pointer;
}
.close:hover {
  border-color: var(--danger);
  color: #ffb3b3;
}
.body {
  flex: 1;
  display: grid;
  grid-template-columns: 184px 1fr;
  min-height: 0;
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
