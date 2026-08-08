/**
 * Platzbedarf des Arbeitsverzeichnisses: wie groß der Ordner jeder App ist und
 * wie viel im Datenordner liegt.
 *
 * Gerechnet wird ausschließlich HIER, im Hauptprozess (siehe electron/main:
 * morphos:diskUsage) — der Renderer bekommt nur Zahlen und läuft selbst nie
 * über das Dateisystem. Gezählt wird auch nur, was innerhalb der beiden
 * genannten Ordner liegt: Symlinks werden nicht verfolgt, sondern übergangen,
 * damit ein Verweis nach draußen nicht plötzlich mitgemessen wird.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readManifest } from './appstore';
import type { AppUsage, DiskUsage } from '@/types';

/** Icon einer App, solange das Manifest keines nennt (wie in main:listApps). */
const FALLBACK_ICON = '🧩';

/**
 * Die Summe aller Dateien unter `dir`, samt Unterordnern. Was sich nicht lesen
 * lässt, zählt als nichts — eine Größenangabe ist nichts, wofür der Aufruf
 * scheitern sollte.
 */
export async function folderSize(dir: string): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    // Symlinks führen womöglich aus dem Ordner heraus — sie werden übergangen.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      total += await folderSize(child);
    } else if (entry.isFile()) {
      try {
        total += (await fs.promises.lstat(child)).size;
      } catch {
        /* verschwunden oder nicht lesbar — zählt nicht */
      }
    }
  }
  return total;
}

/**
 * Stellt den Platzbedarf eines Arbeitsverzeichnisses zusammen: je App ihr
 * Ordner (größte zuerst) und, sofern festgelegt, der Datenordner. Als App gilt
 * — wie überall — ein Unterordner mit `app.json`; lose Dateien und fremde
 * Ordner bleiben außen vor.
 */
export async function collectDiskUsage(folder: string, dataRoot: string | null): Promise<DiskUsage> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(folder, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const apps: AppUsage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const dir = path.join(folder, entry.name);
    const meta = readManifest(dir);
    if (!meta) continue;
    apps.push({
      id: meta.id ?? entry.name,
      name: meta.name ?? entry.name,
      icon: meta.icon ?? FALLBACK_ICON,
      bytes: await folderSize(dir),
    });
  }
  apps.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));

  const appsBytes = apps.reduce((sum, a) => sum + a.bytes, 0);
  const data = dataRoot ? { path: dataRoot, bytes: await folderSize(dataRoot) } : null;
  return { apps, appsBytes, data };
}
