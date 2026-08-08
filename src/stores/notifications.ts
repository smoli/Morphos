import { defineStore } from 'pinia';
import { MAX_TOASTS, overflow, timeoutFor, type Toast, type ToastKind } from '@/core/toasts';

interface NotificationsState {
  toasts: Toast[];
}

let toastCounter = 0;
const nextToastId = (): string => `toast-${(toastCounter += 1)}`;

/**
 * Die laufenden Uhren der Meldungen — außerhalb des States, weil ein Timer kein
 * serialisierbarer Wert ist. Wird eine Meldung vorzeitig weggeklickt oder vom
 * Deckel abgeworfen, wird ihre Uhr hier gelöscht.
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Der Meldungsstapel der Schale: kurze Rückmeldungen wie „Agent fertig“,
 * „Gespeichert“ oder ein Fehler. Jeder Teil der Oberfläche meldet hier hinein,
 * statt sich ein eigenes Banner zu bauen.
 *
 * Der Stapel gehört der Schale, nicht einem Fenster — eine Meldung überlebt das
 * Fenster, das sie ausgelöst hat. Wie lange sie steht und wie viele gleichzeitig
 * liegen dürfen, entscheidet die Logik in core/toasts.
 */
export const useNotificationsStore = defineStore('notifications', {
  state: (): NotificationsState => ({
    toasts: [],
  }),

  actions: {
    /**
     * Legt eine Meldung oben auf den Stapel und liefert ihre Id (oder null, wenn
     * nichts zu melden war). Hinweis und Erfolg verblassen von selbst, ein
     * Fehler bleibt bis zum Wegklicken stehen.
     */
    notify({ kind = 'info', text }: { kind?: ToastKind; text: string }): string | null {
      const message = text.trim();
      if (!message) return null;

      const id = nextToastId();
      this.toasts.push({ id, kind, text: message });
      // Der Stapel bleibt lesbar: Was über den Deckel hinausgeht, fällt hinten weg.
      for (const old of overflow(this.toasts, MAX_TOASTS)) this.dismiss(old.id);

      const ms = timeoutFor(kind);
      if (ms > 0) timers.set(id, setTimeout(() => this.dismiss(id), ms));
      return id;
    },

    info(text: string): string | null {
      return this.notify({ kind: 'info', text });
    },

    success(text: string): string | null {
      return this.notify({ kind: 'success', text });
    },

    error(text: string): string | null {
      return this.notify({ kind: 'error', text });
    },

    /** Nimmt eine Meldung weg (weggeklickt, abgelaufen oder abgeworfen). */
    dismiss(id: string): void {
      const timer = timers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(id);
      }
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },

    /** Räumt den ganzen Stapel ab. */
    clear(): void {
      for (const t of [...this.toasts]) this.dismiss(t.id);
    },
  },
});
