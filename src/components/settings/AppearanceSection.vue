<script setup lang="ts">
/**
 * Einstellungs-Bereich „Darstellung“: zuerst, wie der Desktop seine Fenster
 * stellt — überlappend, einzeln oder gekachelt (c0069; die Darstellungen selbst
 * stehen in core/uimode). Danach die schwebende Leiste (das Dock): an welchem
 * Rand sie steht (c0063), wie durchsichtig sie ist (c0060), wie dicht ihr
 * Milchglas-Schleier (c0061) — und ob sie sich aus dem Weg legt, bis der Zeiger
 * den Rand erreicht (c0062). Alles gilt je Arbeitsverzeichnis und wird sofort
 * wirksam; die Vorschau zeigt es über dem echten Hintergrund dieses
 * Verzeichnisses.
 */
import { computed } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { DOCK_EDGES } from '@/core/dock';
import { UI_MODE_OPTIONS } from '@/core/uimode';
import type { DockEdge, UiMode } from '@/types';
import {
  DEFAULT_TILE_GAP,
  MAX_TILE_GAP,
  TILE_GAP_STEP,
} from '@/core/tilesettings';
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
const edge = computed(() => workspace.dockEdge);

function onLevel(event: Event): void {
  workspace.setDockTransparency(Number((event.target as HTMLInputElement).value));
}

function onBlur(event: Event): void {
  workspace.setDockBlur(Number((event.target as HTMLInputElement).value));
}

function onAutohide(event: Event): void {
  workspace.setDockAutohide((event.target as HTMLInputElement).checked);
}

function onEdge(id: DockEdge): void {
  workspace.setDockEdge(id);
}

const uiMode = computed(() => workspace.uiMode);

function onUiMode(id: UiMode): void {
  workspace.setUiMode(id);
}

// ---- Die Kacheln (c0072) ----

const tileGap = computed(() => workspace.tileGap);
const chromeHidden = computed(() => workspace.tileChromeHidden);

function onTileGap(event: Event): void {
  workspace.setTileGap(Number((event.target as HTMLInputElement).value));
}

function onChromeHidden(event: Event): void {
  workspace.setTileChromeHidden((event.target as HTMLInputElement).checked);
}
</script>

<template>
  <section class="block">
    <h3>Der Desktop</h3>
    <p class="hint">
      Wie der Desktop seine Fenster stellt. Die Wahl gilt sofort und bleibt für dieses
      Arbeitsverzeichnis erhalten.
    </p>

    <div class="modes" role="group" aria-label="Darstellung des Desktops">
      <button
        v-for="m in UI_MODE_OPTIONS"
        :key="m.id"
        type="button"
        class="ui-mode"
        :data-mode="m.id"
        :class="{ active: uiMode === m.id }"
        :aria-pressed="uiMode === m.id"
        @click="onUiMode(m.id)"
      >
        <span class="mode-icon" aria-hidden="true">{{ m.icon }}</span>
        <span class="mode-name">{{ m.label }}</span>
        <small class="mode-hint">{{ m.hint }}</small>
      </button>
    </div>
  </section>

  <section class="block tiles">
    <h3>Die Kacheln</h3>
    <p class="hint">
      Was den Kachel-Modus ausmacht: wie viel Luft zwischen zwei Kacheln steht — und ob eine
      Kachel ihre Titelleiste trägt oder sie weglegt, bis der Zeiger an ihren oberen Rand kommt.
      Beides gilt für dieses Arbeitsverzeichnis und wird sofort wirksam.
    </p>

    <div class="tiles-preview" :class="{ 'no-chrome': chromeHidden }" :style="{ gap: `${tileGap}px`, padding: `${tileGap}px` }">
      <div v-for="n in 2" :key="n" class="tile-preview">
        <span class="tile-bar" aria-hidden="true"></span>
      </div>
    </div>

    <div class="row">
      <span class="end">lückenlos</span>
      <input
        class="gap-level"
        type="range"
        min="0"
        :max="MAX_TILE_GAP"
        :step="TILE_GAP_STEP"
        :value="tileGap"
        aria-label="Fuge zwischen zwei Kacheln"
        @input="onTileGap"
      />
      <span class="end">weit</span>
      <code class="gap-value">{{ tileGap }} px</code>
      <button
        type="button"
        class="btn gap-reset"
        :disabled="!workspace.hasTileGap"
        @click="workspace.resetTileGap()"
      >
        Auf Vorgabe zurücksetzen ({{ DEFAULT_TILE_GAP }} px)
      </button>
    </div>

    <label class="row switch">
      <input class="chrome-hide" type="checkbox" :checked="chromeHidden" @change="onChromeHidden" />
      <span>
        Titelleiste ausblenden
        <small class="muted">
          — sie kommt hervor, sobald der Zeiger den oberen Rand der Kachel erreicht.
        </small>
      </span>
    </label>
  </section>

  <section class="block dock">
    <h3>Das Dock</h3>
    <p class="hint">
      An welchem Rand die Leiste steht, wie stark der Hintergrund durch sie scheint, wie sehr sie
      ihn dabei verwischt — und ob sie sich aus dem Weg legt, bis der Zeiger an den Rand kommt.
      Alles gilt für dieses Arbeitsverzeichnis und bleibt über den Neustart erhalten.
    </p>

    <div
      class="preview"
      :class="`edge-${edge}`"
      :style="{ background: wallpaperCss(workspace.wallpaper) }"
    >
      <div
        class="dock-preview"
        :class="{ away: autohide }"
        :style="{ background: dockBackgroundCss(level), '--dock-blur': dockBlurCss(blur) }"
      >
        <span v-for="g in PREVIEW_GLYPHS" :key="g" class="glyph" aria-hidden="true">{{ g }}</span>
      </div>
    </div>

    <div class="row">
      <span class="label">Wo das Dock steht</span>
      <span class="seg edges" role="group" aria-label="Wo das Dock steht">
        <button
          v-for="e in DOCK_EDGES"
          :key="e.id"
          type="button"
          class="edge"
          :data-edge="e.id"
          :class="{ active: edge === e.id }"
          @click="onEdge(e.id)"
        >
          {{ e.label }}
        </button>
      </span>
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
/* Kachel- und Dock-Block stehen unter dem Desktop-Block — mit Luft dazwischen. */
.tiles,
.dock {
  margin-top: 26px;
}
/*
 * Die Vorschau der Kacheln: zwei Kacheln in einer Fläche, mit genau der Fuge
 * dazwischen (und ringsum), die der Regler meint — so wie der Desktop sie stellt
 * (views/DesktopView rückt die Kachelfläche um eine Fuge ein).
 */
.tiles-preview {
  display: flex;
  height: 96px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-2);
}
.tile-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  overflow: hidden;
}
/* Die angedeutete Titelleiste — weggelegt ist sie schlicht nicht da. */
.tile-bar {
  height: 8px;
  background: var(--border);
}
.tiles-preview.no-chrome .tile-bar {
  display: none;
}
/*
 * Die drei Darstellungen als Karten nebeneinander: Zeichen, Name, ein Satz.
 * Sie tragen mehr Text als ein Segment-Umschalter (wie er in der Kopfleiste
 * stand) und dürfen darum umbrechen.
 */
.modes {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.ui-mode {
  flex: 1 1 160px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.ui-mode:hover {
  border-color: var(--accent);
}
.ui-mode.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.mode-icon {
  font-size: 18px;
  line-height: 1;
}
.mode-name {
  font-size: 13px;
  font-weight: 600;
}
.mode-hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
.preview {
  height: 96px;
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 10px;
}
/* Die Vorschau stellt die Leiste an denselben Rand wie der Desktop (c0063). */
.preview.edge-top {
  align-items: flex-start;
}
.preview.edge-left,
.preview.edge-right {
  align-items: center;
}
.preview.edge-left {
  justify-content: flex-start;
}
.preview.edge-right {
  justify-content: flex-end;
}
/*
 * Hochkant stapeln sich die Glyphen — in den 96 px der Vorschau nur, wenn sie
 * dabei etwas kleiner und enger stehen als quer.
 */
.preview.edge-left .dock-preview,
.preview.edge-right .dock-preview {
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
}
.preview.edge-left .glyph,
.preview.edge-right .glyph {
  font-size: 13px;
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
/* Ausgeblendet: Die Leiste zieht sich über ihren Rand — hier nur angedeutet. */
.dock-preview.away {
  transform: translateY(60%);
  opacity: 0.45;
}
.preview.edge-top .dock-preview.away {
  transform: translateY(-60%);
}
.preview.edge-left .dock-preview.away {
  transform: translateX(-60%);
}
.preview.edge-right .dock-preview.away {
  transform: translateX(60%);
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
/* Die Aufschrift vor den vier Rändern — kein Reglerende, darum größer. */
.label {
  font-size: 13px;
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
