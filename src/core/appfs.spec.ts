import { describe, it, expect, vi } from 'vitest';
import { BRIDGE_SDK, CSP_META, injectBridge, dispatchFsRequest, ALLOWED_OPS } from './appfs';
import type { FsResponse } from '@/types';

describe('BRIDGE_SDK', () => {
  it('stellt window.morphosFS mit den erwarteten Methoden bereit', () => {
    expect(BRIDGE_SDK).toContain('window.morphosFS');
    for (const m of ['readFile', 'writeFile', 'list', 'exists', 'stat', 'mkdir', 'remove']) {
      expect(BRIDGE_SDK).toContain(m);
    }
    // Kommuniziert per postMessage mit dem Host.
    expect(BRIDGE_SDK).toContain('postMessage');
  });
});

describe('injectBridge', () => {
  it('fügt das Bridge-Skript in den <head> ein', () => {
    const html = '<!DOCTYPE html><html><head><title>X</title></head><body>b</body></html>';
    const out = injectBridge(html);
    expect(out).toContain('data-morphos-bridge');
    expect(out.indexOf('data-morphos-bridge')).toBeGreaterThan(out.indexOf('<head>'));
    expect(out.indexOf('data-morphos-bridge')).toBeLessThan(out.indexOf('</head>'));
    expect(out).toContain('<title>X</title>');
  });

  it('fügt das Skript auch ohne <head> hinter <html> ein', () => {
    const out = injectBridge('<html><body>b</body></html>');
    expect(out).toContain('data-morphos-bridge');
    expect(out.indexOf('data-morphos-bridge')).toBeGreaterThan(out.indexOf('<html>'));
  });

  it('injiziert nicht doppelt', () => {
    const once = injectBridge('<html><head></head><body></body></html>');
    const twice = injectBridge(once);
    expect(twice).toBe(once);
    expect(twice.match(/data-morphos-bridge/g)).toHaveLength(1);
  });

  it('lässt leeres HTML unangetastet', () => {
    expect(injectBridge('')).toBe('');
  });

  it('erzwingt Offline-Betrieb per Content-Security-Policy', () => {
    const out = injectBridge('<!DOCTYPE html><html><head></head><body></body></html>');
    expect(out).toContain('Content-Security-Policy');
    expect(out).toContain("default-src 'none'");
    // Inline-Skripte und -Styles der erzeugten App müssen weiter funktionieren.
    expect(CSP_META).toContain("script-src 'unsafe-inline'");
    expect(CSP_META).toContain("style-src 'unsafe-inline'");
    // Die CSP muss VOR dem Bridge-Skript stehen, damit sie früh greift.
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('data-morphos-bridge'));
    // Nicht doppelt injizieren.
    expect(injectBridge(out).match(/Content-Security-Policy/g)).toHaveLength(1);
  });
});

describe('dispatchFsRequest', () => {
  const host = vi.fn(async (): Promise<FsResponse> => ({ ok: true, result: 'inhalt' }));

  it('leitet eine gültige Anfrage mit dem Zugriffsordner an den Host weiter', async () => {
    host.mockClear();
    const res = await dispatchFsRequest({ op: 'read', path: 'notes.txt' }, '/data', host);
    expect(host).toHaveBeenCalledWith('/data', { op: 'read', path: 'notes.txt' });
    expect(res).toEqual({ ok: true, result: 'inhalt' });
  });

  it('lehnt ab, wenn kein Zugriffsordner festgelegt ist', async () => {
    host.mockClear();
    const res = await dispatchFsRequest({ op: 'read', path: 'x' }, null, host);
    expect(res.ok).toBe(false);
    expect(host).not.toHaveBeenCalled();
  });

  it('lehnt unbekannte Operationen ab', async () => {
    host.mockClear();
    const res = await dispatchFsRequest({ op: 'evil' as never, path: 'x' }, '/data', host);
    expect(res.ok).toBe(false);
    expect(host).not.toHaveBeenCalled();
  });

  it('führt die Operation nur nach erteilter Berechtigung aus', async () => {
    host.mockClear();
    const authorize = vi.fn(async () => true);
    const res = await dispatchFsRequest({ op: 'write', path: 'a.txt', data: 'x' }, '/data', host, authorize);
    expect(authorize).toHaveBeenCalledWith('write', 'a.txt');
    expect(host).toHaveBeenCalledOnce();
    expect(res.ok).toBe(true);
  });

  it('führt die Operation NICHT aus, wenn die Berechtigung verweigert wird', async () => {
    host.mockClear();
    const authorize = vi.fn(async () => false);
    const res = await dispatchFsRequest({ op: 'delete', path: 'a.txt' }, '/data', host, authorize);
    expect(res.ok).toBe(false);
    expect(host).not.toHaveBeenCalled();
  });

  it('deckt genau die erlaubten Operationen ab', () => {
    expect([...ALLOWED_OPS].sort()).toEqual(
      ['delete', 'exists', 'list', 'mkdir', 'read', 'stat', 'write'].sort(),
    );
  });
});
