<script setup lang="ts">
/**
 * Der Datei-Explorer der Schale — die Ansicht im System-Fenster „Dateien“.
 *
 * Noch ein Platzhalter: Das Blättern durch den Datenordner (mit mitlaufender
 * Aktualisierung) kommt in c0048, Vorschauen in c0049, Verwalten und Papierkorb
 * in c0050. Hier steht bislang nur, was dieses Fenster einmal zeigen wird.
 */
</script>

<template>
  <div class="explorer">
    <p class="ex-hint">
      Hier entsteht der Datei-Explorer: Er zeigt den Datenordner dieses Arbeitsverzeichnisses.
    </p>
  </div>
</template>

<style scoped>
.explorer {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
}
.ex-hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  max-width: 40ch;
}
</style>
