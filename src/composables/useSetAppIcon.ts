import { useWorkspaceStore } from '@/stores/workspace';
import { useDesktopStore } from '@/stores/desktop';
import { useAppWindow } from '@/stores/app';

/**
 * Setzt das Icon einer App an EINER Stelle — und überall dort, wo die App
 * erscheint: auf der Platte (Manifest), in der Kachel des Desktops und, falls
 * ein Fenster offen ist, in dessen Titelleiste, Dock-Eintrag und Zustand.
 * Deshalb wirkt der Wechsel gleichermaßen bei offener wie geschlossener App.
 *
 * `icon` ist ein Emoji oder ein Bild als data:-URI; `null` setzt auf die
 * Vorgabe des LLM zurück. Liefert true, wenn das Icon gesetzt werden konnte.
 */
export function useSetAppIcon(): (appId: string, icon: string | null) => Promise<boolean> {
  const workspace = useWorkspaceStore();
  const desktop = useDesktopStore();

  return async (appId: string, icon: string | null): Promise<boolean> => {
    const effective = await workspace.setAppIcon(appId, icon);
    if (effective === null) return false;

    desktop.applyIcon(appId, effective);
    for (const win of desktop.windows) {
      if (win.appId === appId) useAppWindow(win.instanceId).applyIcon(effective, icon !== null);
    }
    return true;
  };
}
