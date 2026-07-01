<script setup lang="ts">
const emit = defineEmits<{ pick: [example: string] }>();

const examples = [
  { icon: '🧮', label: 'Taschenrechner', text: 'Ein moderner wissenschaftlicher Taschenrechner.' },
  { icon: '📝', label: 'Editor', text: 'Ein Texteditor mit Markdown-Vorschau nebeneinander.' },
  { icon: '📊', label: 'Tabelle', text: 'Eine einfache Tabellenkalkulation mit Summenformeln.' },
  { icon: '✅', label: 'To-do-Liste', text: 'Eine To-do-Liste mit Kategorien und Fortschrittsbalken.' },
];
</script>

<template>
  <section class="welcome">
    <h1>Was soll diese Anwendung sein?</h1>
    <p class="lead">
      Beschreibe deine Idee — ein Taschenrechner, ein Texteditor, eine Tabellenkalkulation,
      ein Spiel. Die Oberfläche und die Funktionen entstehen live.
    </p>
    <div class="examples">
      <button
        v-for="ex in examples"
        :key="ex.label"
        class="chip"
        type="button"
        @click="emit('pick', ex.text)"
      >
        {{ ex.icon }} {{ ex.label }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
h1 {
  font-size: 30px;
  margin: 0 0 10px;
}
.lead {
  color: var(--muted);
  max-width: 560px;
  margin: 0 0 26px;
  line-height: 1.55;
}
.examples {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.chip {
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 16px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.15s, transform 0.1s;
}
.chip:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
</style>
