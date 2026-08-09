<script setup lang="ts">
/**
 * Einstellungs-Bereich „Tastenkürzel“: der Spickzettel zu core/shortcuts —
 * dieselbe Liste, die der Desktop auswertet (noch nicht veränderbar).
 */
import { SHORTCUTS, SWITCHER_KEYS } from '@/core/shortcuts';
</script>

<template>
  <section class="block">
    <h3>Tastenkürzel</h3>
    <p class="hint">
      Die Kürzel gelten auf dem Desktop, solange nicht gerade in ein Feld getippt wird — weder der
      Chat einer App noch eine laufende App verliert ihre Tastendrücke an die Schale.
    </p>
    <ul class="keys">
      <li v-for="s in SHORTCUTS" :key="s.id">
        <span class="what">{{ s.label }}</span>
        <kbd>{{ s.keys }}</kbd>
      </li>
      <li>
        <span class="what">Fenster wechseln (halten und ⇥ wiederholen)</span>
        <kbd>{{ SWITCHER_KEYS }}</kbd>
      </li>
    </ul>
    <p class="hint foot">
      ⌘/Strg + W und ⌘/Strg + M gehören dem Programmfenster selbst — die Fensterbefehle des
      Desktops tragen darum zusätzlich die Umschalttaste. Unter macOS nimmt sich das System
      ⌘ + Tab für den Programmwechsel; dort führt Strg + Tab durch die Fenster. Ebenso gehört
      ⌘ + Leertaste dort der Suche des Systems — ins Startmenü führt darum auch Strg/⌘ + K.
    </p>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.keys {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.keys li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  font-size: 13px;
}
.keys li:hover {
  background: var(--panel-2);
  border-color: var(--border);
}
.what {
  color: var(--text);
}
kbd {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 3px 8px;
  font-family: inherit;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.foot {
  margin: 14px 0 0;
}
</style>
