<script setup lang="ts">
/**
 * Einstellungs-Bereich „Hintergrund“: die Fläche des Desktops einfärben — eine
 * der angebotenen Vorlagen, eine eigene Farbe oder ein Bild. Das Bild wird hier
 * verkleinert und gerastert; abgelegt wird nur ein data:-URI, damit der
 * Hintergrund beim nächsten Start ohne die Quelldatei wieder da ist.
 */
import { computed, ref } from 'vue';
import { useWorkspaceStore } from '@/stores/workspace';
import { fitIconSize } from '@/core/icon';
import {
  MAX_WALLPAPER_BYTES,
  MAX_WALLPAPER_PX,
  sameWallpaper,
  validateWallpaperImage,
  WALLPAPER_FILE_TYPES,
  wallpaperCss,
  WALLPAPER_PRESETS,
} from '@/core/wallpaper';
import type { Wallpaper } from '@/types';

const workspace = useWorkspaceStore();

const color = ref('#1b2030');
const error = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

/** Immer kleiner rechnen, bis das Bild unter den Deckel passt (Fotos sind dicht). */
const STEPS = [MAX_WALLPAPER_PX, 1440, 1024];
/** Bildgüte (JPEG) je Stufe — erst kleiner rechnen, dann stärker verdichten. */
const QUALITY = [0.82, 0.7, 0.6];

const current = computed(() => workspace.wallpaper);
const preview = computed(() => wallpaperCss(current.value));

function apply(wallpaper: Wallpaper): void {
  error.value = workspace.setWallpaper(wallpaper) ? null : 'Dieser Hintergrund lässt sich nicht setzen.';
}

function useColor(): void {
  apply({ kind: 'color', color: color.value });
}

function reset(): void {
  error.value = null;
  workspace.resetWallpaper();
}

function pickImage(): void {
  fileInput.value?.click();
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // dieselbe Datei soll erneut wählbar bleiben
  if (!file) return;
  error.value = null;
  if (!WALLPAPER_FILE_TYPES.includes(file.type.toLowerCase())) {
    error.value = 'Dieser Dateityp wird nicht unterstützt (PNG, JPEG, GIF, WebP, SVG).';
    return;
  }
  try {
    apply({ kind: 'image', image: await rasterize(file) });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

/**
 * Wandelt die gewählte Datei in ein JPEG unter dem Deckel. Das Rastern erledigt
 * zugleich die Sicherheitsfrage bei SVG: Abgelegt wird nur ein Bild aus
 * Bildpunkten, kein Dokument, das etwas ausführen könnte.
 */
async function rasterize(file: File): Promise<string> {
  const image = await loadImage(file);
  for (const max of STEPS) {
    const { width, height } = fitIconSize(image.naturalWidth, image.naturalHeight, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    ctx.drawImage(image, 0, 0, width, height);
    for (const quality of QUALITY) {
      const dataUri = canvas.toDataURL('image/jpeg', quality);
      if (validateWallpaperImage(dataUri).ok) return dataUri;
    }
  }
  throw new Error('Das Bild lässt sich nicht klein genug rechnen. Bitte ein kleineres Bild wählen.');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden.'));
    };
    image.src = url;
  });
}
</script>

<template>
  <section class="block">
    <h3>Hintergrund des Desktops</h3>
    <p class="hint">
      Gilt für dieses Arbeitsverzeichnis und bleibt über den Neustart erhalten. Ein gewähltes Bild
      wird verkleinert mitgespeichert — es lädt nichts aus dem Netz nach.
    </p>

    <div class="preview" :style="{ background: preview }">
      <span class="preview-label">{{ workspace.hasWallpaper ? 'Eigener Hintergrund' : 'Vorgabe' }}</span>
    </div>

    <h4>Vorlagen</h4>
    <div class="presets">
      <button
        v-for="p in WALLPAPER_PRESETS"
        :key="p.id"
        type="button"
        class="preset"
        :class="{ active: sameWallpaper(current, p.wallpaper) }"
        :style="{ background: wallpaperCss(p.wallpaper) }"
        :title="p.label"
        :aria-label="p.label"
        :aria-pressed="sameWallpaper(current, p.wallpaper)"
        @click="apply(p.wallpaper)"
      ></button>
    </div>

    <h4>Eigene Farbe</h4>
    <div class="row">
      <input v-model="color" type="color" class="color" aria-label="Eigene Farbe" />
      <code class="value">{{ color }}</code>
      <button type="button" class="btn" @click="useColor">Übernehmen</button>
    </div>

    <h4>Bild</h4>
    <p class="hint">
      PNG, JPEG, GIF, WebP oder SVG. Das Bild wird auf höchstens {{ MAX_WALLPAPER_PX }} px
      verkleinert (bis {{ Math.round(MAX_WALLPAPER_BYTES / 1024) }} KB) und deckend über die Fläche
      gelegt.
    </p>
    <div class="row">
      <button type="button" class="btn" @click="pickImage">Bild wählen …</button>
      <button type="button" class="btn" :disabled="!workspace.hasWallpaper" @click="reset">
        Auf Vorgabe zurücksetzen
      </button>
    </div>
    <input ref="fileInput" class="file" type="file" :accept="WALLPAPER_FILE_TYPES.join(',')" @change="onFile" />

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped src="./settings.css"></style>
<style scoped>
h4 {
  margin: 18px 0 8px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}
.preview {
  height: 96px;
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  align-items: flex-end;
  padding: 8px 10px;
}
.preview-label {
  background: rgba(15, 17, 21, 0.7);
  border-radius: 7px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--muted);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset {
  width: 64px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 9px;
  cursor: pointer;
  padding: 0;
}
.preset:hover {
  border-color: var(--accent);
}
.preset.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(108, 140, 255, 0.35);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.color {
  width: 48px;
  height: 32px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
  cursor: pointer;
}
.value {
  font-size: 12px;
  color: var(--muted);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
  border-color: var(--border);
}
.file {
  display: none;
}
.error {
  margin: 12px 0 0;
  background: rgba(255, 108, 108, 0.12);
  border: 1px solid var(--danger);
  color: #ffb3b3;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 12px;
}
</style>
