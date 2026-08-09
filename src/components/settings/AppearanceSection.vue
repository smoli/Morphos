<script setup lang="ts">
/**
 * Einstellungs-Bereich „Darstellung“: wie durchsichtig die Schale ist — heute
 * die Leiste am unteren Rand (das Dock). Der Wert gilt je Arbeitsverzeichnis
 * und wird sofort wirksam; die Vorschau zeigt ihn über dem echten Hintergrund
 * dieses Verzeichnisses.
 */
import { computed } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { DEFAULT_DOCK_TRANSPARENCY, dockBackgroundCss, transparencyPercent, TRANSPARENCY_STEP } from '@/core/transparency';
import { wallpaperCss } from '@/core/wallpaper';

const workspace = useWorkspaceStore();

/** Ein paar Glyphen, damit die Vorschau aussieht wie das Dock (sie tun nichts). */
const PREVIEW_GLYPHS = ['＋', '📁', '⚙️', '🧮'];

const level = computed(() => workspace.dockTransparency);
const percent = computed(() => transparencyPercent(level.value));

function onLevel(event: Event): void {
  workspace.setDockTransparency(Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <section class="block">
    <h3>Durchsichtigkeit des Docks</h3>
    <p class="hint">
      Wie stark der Hintergrund durch die Leiste am unteren Rand scheint. Gilt für dieses
      Arbeitsverzeichnis und bleibt über den Neustart erhalten; ihr Milchglas-Schleier bleibt dabei.
    </p>

    <div class="preview" :style="{ background: wallpaperCss(workspace.wallpaper) }">
      <div class="dock-preview" :style="{ background: dockBackgroundCss(level) }">
        <span v-for="g in PREVIEW_GLYPHS" :key="g" class="glyph" aria-hidden="true">{{ g }}</span>
      </div>
    </div>

    <div class="row">
      <span class="end">deckend</span>
      <input
        class="level"
        type="range"
        min="0"
        max="1"
        :step="TRANSPARENCY_STEP"
        :value="level"
        aria-label="Durchsichtigkeit des Docks"
        @input="onLevel"
      />
      <span class="end">durchsichtig</span>
      <code class="value">{{ percent }} %</code>
      <button
        type="button"
        class="btn reset"
        :disabled="!workspace.hasDockTransparency"
        @click="workspace.resetDockTransparency()"
      >
        Auf Vorgabe zurücksetzen ({{ transparencyPercent(DEFAULT_DOCK_TRANSPARENCY) }} %)
      </button>
    </div>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
.preview {
  height: 96px;
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 10px;
}
/* Dieselbe Leiste wie auf dem Desktop, nur kleiner (DesktopView: .dock). */
.dock-preview {
  display: flex;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 14px;
  backdrop-filter: blur(14px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.glyph {
  font-size: 20px;
  line-height: 1;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.level {
  flex: 1;
  min-width: 160px;
  accent-color: var(--accent);
  cursor: pointer;
}
.end {
  font-size: 11px;
  color: var(--muted);
}
.value {
  font-size: 12px;
  color: var(--muted);
  min-width: 44px;
  text-align: right;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
  border-color: var(--border);
}
</style>
