import type { MorphosHost } from '@/types';

// Ermöglicht das Einschleusen einer Attrappe in Tests und das Anbinden der
// echten Brücke (`window.morphos`) zur Laufzeit.
let host: MorphosHost | null = null;

export function setHost(impl: MorphosHost): void {
  host = impl;
}

export function getHost(): MorphosHost {
  if (host) return host;
  if (typeof window !== 'undefined' && window.morphos) return window.morphos;
  throw new Error('Morphos-Host nicht verfügbar (window.morphos fehlt).');
}
