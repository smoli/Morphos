<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ busy: boolean }>();
const emit = defineEmits<{ submit: [text: string] }>();

const text = ref('');

function onSubmit(): void {
  const value = text.value.trim();
  if (!value) return;
  emit('submit', value);
  text.value = '';
}
</script>

<template>
  <form class="promptbar" @submit.prevent="onSubmit">
    <input
      v-model="text"
      type="text"
      autocomplete="off"
      :disabled="busy"
      placeholder="Beschreibe, was die App sein oder als Nächstes können soll …"
    />
    <button type="submit" :disabled="busy">Umsetzen ▸</button>
  </form>
</template>

<style scoped>
.promptbar {
  display: flex;
  gap: 10px;
}
input {
  flex: 1;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 13px 15px;
  border-radius: 12px;
  font-size: 15px;
  outline: none;
}
input:focus {
  border-color: var(--accent);
}
button {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  border: 0;
  padding: 0 22px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
