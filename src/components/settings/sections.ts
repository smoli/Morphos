/**
 * Verzeichnis der Einstellungs-Bereiche — die Erweiterungsstelle des
 * Einstellungsfensters. Ein neuer Bereich ist eine Komponente in diesem Ordner
 * plus ein Eintrag in dieser Liste; das Fenster baut Seitenleiste und Inhalt
 * allein daraus (`SettingsPanel` nimmt die Liste auch als Prop, für Tests).
 */
import type { Component } from 'vue';
import AgentsSection from './AgentsSection.vue';
import DataFolderSection from './DataFolderSection.vue';
import PermissionsSection from './PermissionsSection.vue';
import LibrariesSection from './LibrariesSection.vue';
import ShortcutsSection from './ShortcutsSection.vue';
import TelemetrySection from './TelemetrySection.vue';
import WallpaperSection from './WallpaperSection.vue';
import AppearanceSection from './AppearanceSection.vue';

export interface SettingsSection {
  /** Stabiler Schlüssel (auch für „zuletzt offener Bereich“ o. Ä.). */
  id: string;
  /** Name in der Seitenleiste. */
  label: string;
  /** Emoji-Symbol vor dem Namen. */
  icon: string;
  /** Die Komponente, die den Bereich rendert. */
  component: Component;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'agents', label: 'Agenten', icon: '🤖', component: AgentsSection },
  { id: 'data', label: 'Datenordner', icon: '📂', component: DataFolderSection },
  { id: 'permissions', label: 'Berechtigungen', icon: '🔐', component: PermissionsSection },
  { id: 'libs', label: 'Bibliotheken', icon: '📦', component: LibrariesSection },
  { id: 'wallpaper', label: 'Hintergrund', icon: '🖼', component: WallpaperSection },
  { id: 'appearance', label: 'Darstellung', icon: '🪟', component: AppearanceSection },
  { id: 'shortcuts', label: 'Tastenkürzel', icon: '⌨️', component: ShortcutsSection },
  { id: 'telemetry', label: 'Telemetrie', icon: '📊', component: TelemetrySection },
];
