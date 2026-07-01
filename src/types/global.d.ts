import type { MorphosHost } from './index';

declare global {
  interface Window {
    morphos?: MorphosHost;
  }
}

export {};
