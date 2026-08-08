import { computed, onBeforeUnmount, ref, watch, type ComputedRef } from 'vue';
import { formatElapsed } from '@/core/agent';

/**
 * Die laufende Dauer seit `startedAt` als fertige Anzeige (m:ss). Der Taktgeber
 * läuft nur, solange ein Startzeitpunkt gesetzt ist — ohne Lauf ruht er und die
 * Anzeige ist leer.
 */
export function useElapsed(startedAt: () => number | null | undefined): ComputedRef<string> {
  const now = ref(Date.now());
  let ticker: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (ticker === null) return;
    clearInterval(ticker);
    ticker = null;
  }

  watch(
    startedAt,
    (start) => {
      stop();
      if (!start) return;
      now.value = Date.now();
      ticker = setInterval(() => {
        now.value = Date.now();
      }, 1000);
    },
    { immediate: true },
  );

  onBeforeUnmount(stop);

  return computed(() => {
    const start = startedAt();
    return start ? formatElapsed(now.value - start) : '';
  });
}
