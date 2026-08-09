<script setup lang="ts">
/**
 * Einstellungs-Bereich „Darstellung“: die Leiste am unteren Rand (das Dock).
 * Wie durchsichtig sie ist (c0060), wie dicht ihr Milchglas-Schleier (c0061) —
 * und ob sie sich aus dem Weg legt, bis der Zeiger den Rand erreicht (c0062).
 * Alles gilt je Arbeitsverzeichnis und wird sofort wirksam; die Vorschau zeigt
 * es über dem echten Hintergrund dieses Verzeichnisses.
 */
import { computed } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import {
  BLUR_STEP,
  DEFAULT_DOCK_BLUR,
  DEFAULT_DOCK_TRANSPARENCY,
  dockBackgroundCss,
  dockBlurCss,
  MAX_DOCK_BLUR,
  transparencyPercent,
  TRANSPARENCY_STEP,
} from '@/core/transparency';
import { wallpaperCss } from '@/core/wallpaper';

const workspace = useWorkspaceStore();

/** Ein paar Glyphen, damit die Vorschau aussieht wie das Dock (sie tun nichts). */
const PREVIEW_GLYPHS = ['＋', '📁', '⚙️', '🧮'];

const level = computed(() => workspace.dockTransparency);
const percent = computed(() => transparencyPercent(level.value));
const blur = computed(() => workspace.dockBlur);
const autohide = computed(() => workspace.dockAutohide);

function onLevel(event: Event): void {
  workspace.setDockTransparency(Number((event.target as HTMLInputElement).value));
}

function onBlur(event: Event): void {
  workspace.setDockBlur(Number((event.target as HTMLInputElement).value));
}

function onAutohide(event: Event): void {
  workspace.setDockAutohide((event.target as HTMLInputElement).checked);
}
</script>

<template>
  <section class="block">
    <h3>Das Dock</h3>
    <p class="hint">
      Wie stark der Hintergrund durch die Leiste am unteren Rand scheint, wie sehr sie ihn dabei
      verwischt — und ob sie sich aus dem Weg legt, bis der Zeiger an den Rand kommt. Alles gilt
      für dieses Arbeitsverzeichnis und bleibt über den Neustart erhalten.
    </p>

    <div class="preview" :style="{ background: wallpaperCss(workspace.wallpaper) }">
      <div
        class="dock-preview"
        :class="{ away: autohide }"
        :style="{ background: dockBackgroundCss(level), '--dock-blur': dockBlurCss(blur) }"
      >
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

    <div class="row">
      <span class="end">klar</span>
      <input
        class="blur-level"
        type="range"
        min="0"
        :max="MAX_DOCK_BLUR"
        :step="BLUR_STEP"
        :value="blur"
        aria-label="Milchglas des Docks"
        @input="onBlur"
      />
      <span class="end">matt</span>
      <code class="blur-value">{{ blur }} px</code>
      <button
        type="button"
        class="btn blur-reset"
        :disabled="!workspace.hasDockBlur"
        @click="workspace.resetDockBlur()"
      >
        Auf Vorgabe zurücksetzen ({{ DEFAULT_DOCK_BLUR }} px)
      </button>
    </div>

    <label class="row switch">
      <input class="autohide" type="checkbox" :checked="autohide" @change="onAutohide" />
      <span>
        Dock ausblenden
        <small class="muted">— es kommt hervor, sobald der Zeiger den unteren Rand erreicht.</small>
      </span>
    </label>
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
/*
 * Dieselbe Leiste wie auf dem Desktop, nur kleiner (DesktopView: .dock). Farbe
 * und Schleier stehen oben als `background` und `--dock-blur` daran.
 */
.dock-preview {
  display: flex;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 14px;
  backdrop-filter: var(--dock-blur, blur(14px));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  transition: transform 0.18s ease, opacity 0.18s ease;
}
/* Ausgeblendet: Die Leiste zieht sich unter den Rand — hier nur angedeutet. */
.dock-preview.away {
  transform: translateY(60%);
  opacity: 0.45;
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
.level,
.blur-level {
  flex: 1;
  min-width: 160px;
  accent-color: var(--accent);
  cursor: pointer;
}
.end {
  font-size: 11px;
  color: var(--muted);
}
.value,
.blur-value {
  font-size: 12px;
  color: var(--muted);
  min-width: 44px;
  text-align: right;
}
/* Der Schalter fürs Ausblenden — kein Regler, darum eine eigene Zeile. */
.switch {
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.switch input {
  accent-color: var(--accent);
  cursor: pointer;
}
.switch small {
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
  border-color: var(--border);
}
</style>
